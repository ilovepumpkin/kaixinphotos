'use strict'
import req from 'superagent'
import cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import Album from './album'
import Photo from './photo'

const domainName="http://www.kaixin001.com"

const albumListFile="albums.json"

class KaixinCrawler {

    constructor(uid) {
		this.cookie=this.readCookie()
		//console.log(this.cookie);

		this.albums=[]

		this.albumListUrl = 'http://www.kaixin001.com/photo/albumlist.php'
		this.rootPhotoDir="开心网相册"
		if(uid){
			this.albumListUrl=this.albumListUrl+"?uid="+uid
		}
	}

	async updateRootPhotoDir(){
		const userName=await this.fetchUsername()
		this.rootPhotoDir=this.rootPhotoDir+"("+userName+")"
		if(!fs.existsSync(this.rootPhotoDir)){
			fs.mkdirSync(this.rootPhotoDir);
		}
	}

	async fetchUsername(){
		let res=await this.get(this.albumListUrl)	
		let $ = cheerio.load(res.text)
		return $("b[class=c3]").first().text()
	}

	readCookie(){
		return fs.readFileSync('cookie',{encoding:'utf8',flag:'r'});
	}

	async start() {
		await this.updateRootPhotoDir()

		console.log("deleting damaged files ...");
		this.cleanDamagedFiles(this.rootPhotoDir)

		console.log("fetching photos...");
		this.get(this.albumListUrl)
		.then(
			res => {
				let pageUrls = this.parseAlbumPageUrls(res.text)
				//console.log(pageUrls);

				for (let pageUrl of pageUrls) {
					this.handleAlbumListPage(pageUrl)
				}

			}, err => console.error(err)
			)
	}

	async verify(){
		await this.updateRootPhotoDir()

		console.log("deleting damaged files ...");
		this.cleanDamagedFiles(this.rootPhotoDir)
		
		console.log("verify all photos are downloaded ...");

		let allAlbums=await this.getAlbums()

		const actTotal=fs.readdirSync(this.rootPhotoDir).length;
		if(actTotal !== allAlbums.length){
			console.log(`Total count mismatch. expected:${allAlbums.length}, actual: ${actTotal}.`);
		}

		let success=true
		for(let album of allAlbums){
			const albumPath=path.join(this.rootPhotoDir,album.name)
			if(!fs.existsSync(albumPath)){
				console.log(`Album not exists: ${album.name}`)
				success=false
			}else{
				const actCount=fs.readdirSync(albumPath).length;
				if(parseInt(album.count) !== actCount){
					console.log(`File count mismatch(${album.name}). actual: ${actCount}, expected: ${album.count}.`)
					success=false
				}
			}
		}				

		if(success){
			console.info("Congratulations!! - all photos are downloaded.");
		}
	}

	async getAlbumsPerPage(albumPageUrl) {
		let res=await this.get(albumPageUrl)

		let $ = cheerio.load(res.text)
		let promises=$('a[href^="http://www.kaixin001.com/photo/album.php?"]').map(async (idx, elem) => {
			const albumLink = $(elem)

			let albumName = albumLink.text()
			let albumUrl = albumLink.attr('href')
			let count= albumLink.next().text().match("\\(([0-9]+)\\)")[1]

            if (albumName.endsWith("...")) {
				let res=await this.get(albumUrl)
				let $ = cheerio.load(res.text)
				$('.numBox').remove()
				albumName = $("b[class=c6]").text()
			}
			return new Album(albumName, albumUrl, count)
		}).get()

		return await Promise.all(promises)
	}

	async getAlbums(){
		if(fs.existsSync(albumListFile)){
			console.log(`${albumListFile} is found - load albums from it.`);
			return JSON.parse(fs.readFileSync(albumListFile))
		}

		let albums=[]
		let res=await this.get(this.albumListUrl)
		let pageUrls = this.parseAlbumPageUrls(res.text)

		for (let pageUrl of pageUrls) {
			let albumsPerPage=await this.getAlbumsPerPage(pageUrl)
			albums=albums.concat(albumsPerPage)
		}

		if(!fs.existsSync(albumListFile)){
			console.log(`Saved album data to ${albumListFile}.`);
			fs.writeFileSync(albumListFile, JSON.stringify(albums));
		}

		return albums
	}

	parseAlbumPageUrls(html) {
		let pageUrls = []
		let $ = cheerio.load(html)
		$('span[class=num]').children().each(function(idx, elem) {
			if (idx > 0) {
				pageUrls.push(domainName + $(elem).attr('href'))
			} else {
				pageUrls.push(this.albumListUrl)
			}
		})

		if(pageUrls.length === 0){
			pageUrls.push(this.albumListUrl)
		}
		return pageUrls
	}

	parseAlbumSubPageUrls(html) {
		let pageUrls = []
		let $ = cheerio.load(html)
		let nums=$('span[class=num]').children()

		nums.each(function(idx, elem) {
			if(idx<nums.length-2){
				pageUrls.push(domainName + $(elem).attr('href'))
			}
		})
		return pageUrls
	}

	handleAlbumListPage(albumPageUrl) {
		this.get(albumPageUrl).then(res => {
			const html = res.text
			let $ = cheerio.load(html)
			$('a[href^="http://www.kaixin001.com/photo/album.php?"]').each((idx, elem) => {
				const albumLink = $(elem)

				let albumName = albumLink.text()
				let albumUrl = albumLink.attr('href')
				let count= albumLink.next().text().match("\\(([0-9]+)\\)")[1]

				if (albumName.endsWith("...")) {
					let title
					this.get(albumUrl).then(res => {
						let $ = cheerio.load(res.text)
						$('.numBox').remove()
						albumName = $("b[class=c6]").text()
						this.handleAlbum(new Album(albumName, albumUrl,count))
					})
				} else {
					this.handleAlbum(new Album(albumName, albumUrl,count))
				}

			})
		})
	}

	async downAlbum(name){
		await this.updateRootPhotoDir()
		
		if(!fs.existsSync(albumListFile)){
			console.error(`${albumListFile} not found.`);
			process.exit()
		}

		const albums=await this.getAlbums()
		const filtered=albums.filter(x=>x.name === name)
		if(filtered.length === 0){
			console.error(`Wrong album name - ${name}`);
			process.exit()
		}
		const album=filtered[0]
		this.handleAlbum(album)
	}

	handleAlbum(album) {
		console.log(album.name, album.url, album.count)

		const pageCount=Math.ceil(album.count/18)

		for (var i = 0; i < pageCount; i++) {
			const pageUrl=album.url+"&start="+(i*18)
			this.handleOneAlbumPagePhotos(album.name,pageUrl)
		}

	}

	handleOneAlbumPagePhotos(albumName,pageUrl){
		//console.log(">>>>",albumName, pageUrl)
		this.get(pageUrl).then(res=>{
			let $ = cheerio.load(res.text)
			$('div[class=initimgName]').each((idx, elem) => {
				const nameLink=$(elem).children()
				let photoName=nameLink.attr('title')
				const photoPageUrl=domainName+nameLink.attr('href')


				let uid=photoPageUrl.match("uid=([0-9]+)&")[1]
				let pid=photoPageUrl.match("pid=([0-9]+)&")[1]
				let path1=pid.substr(3,2)
				let path2=pid.substr(5,2)

				let photoUrl=`http://p.kaixin001.com/privacy/photo/${path1}/${path2}/${uid}_${pid}_w1280p.jpg`

				photoName=photoName+`_${pid}`
				this.download(albumName,photoName,photoUrl)
			})
		},err=>console.error(err))

	}

	download(albumName,photoName,photoUrl){
		//console.log("^^^^[download]",albumName,photoName,photoUrl)

		if(!fs.existsSync(this.rootPhotoDir)){
			fs.mkdirSync(rootPhotoDir);
		}

		const albumPath=path.join(this.rootPhotoDir,albumName);

		if(!fs.existsSync(albumPath)){
			fs.mkdirSync(albumPath);
		}

		const filePath=`${this.rootPhotoDir}/${albumName}/${photoName}.jpg`

		if(!fs.existsSync(filePath)){
			let file=fs.createWriteStream(filePath);
			this.reqGet(photoUrl).pipe(file)
			console.log(`${filePath} is downloaded.`)
		}else{
			return
		}
		
	}

	get(url) {
		return this.reqGet(url).then(res=>{return res},err=>{console.error(err)})
	}

	reqGet(url){
		return req.get(url).set('Cookie', this.cookie)
	}

	cleanDamagedFiles(parentPath){
		let files=fs.readdirSync(parentPath);
		for(let file of files){
			let filePath=path.join(parentPath,file)
			const stat=fs.statSync(filePath);
			if(stat.isDirectory()){
				this.cleanDamagedFiles(filePath)				
			}else{
				if(fs.statSync(filePath).size<1000){
					console.log(`${filePath}: ${stat.size} - deleted`);
					fs.unlinkSync(filePath);
				}	
			}
		}

	}

}

// let kxCrawler = new KaixinCrawler()
// kxCrawler.start()
// let album=new Album("UK - Hursley (IBM Confidential)","http://www.kaixin001.com/photo/album.php?uid=2583910&albumid=29138143")
// kxCrawler.handleAlbum(album)
//kxCrawler.verify()

export default KaixinCrawler