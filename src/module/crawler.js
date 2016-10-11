'use strict'
import req from 'superagent'
import cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import Album from './album'
import Photo from './photo'

const albumListUrl = 'http://www.kaixin001.com/photo/albumlist.php'
const domainName="http://www.kaixin001.com"
const rootPhotoDir="开心网相册"

class KaixinCrawler {

	constructor() {
		this.cookie=this.readCookie()
		console.log(this.cookie);

		this.albums=[]
	}

	readCookie(){
		return fs.readFileSync('cookie',{encoding:'utf8',flag:'r'});
	}

	start() {
		console.log("deleting damaged files ...");
		this.cleanDamagedFiles(rootPhotoDir)

		console.log("fetching photos...");
		this.get(albumListUrl)
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
		console.log("deleting damaged files ...");
		this.cleanDamagedFiles(rootPhotoDir)
		
		console.log("verify all photos are downloaded ...");

		let allAlbums=await this.getAlbums()

		const actTotal=fs.readdirSync(rootPhotoDir).length;
		if(actTotal !== allAlbums.length){
			console.log(`Total count mismatch. expected:${allAlbums.length}, actual: ${actTotal}.`);
		}

		for(let album of allAlbums){
			const albumPath=path.join(rootPhotoDir,album.name)
			if(!fs.existsSync(albumPath)){
				console.log(`Album not exists: ${album.name}`)
			}else{
				const actCount=fs.readdirSync(albumPath).length;
				if(parseInt(album.count) !== actCount){
					console.log(`File count mismatch(${album.name}). actual: ${actCount}, expected: ${album.count}.`)
				}
			}
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
		let albums=[]
		let res=await this.get(albumListUrl)
		let pageUrls = this.parseAlbumPageUrls(res.text)

		for (let pageUrl of pageUrls) {
			let albumsPerPage=await this.getAlbumsPerPage(pageUrl)
			albums=albums.concat(albumsPerPage)
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
				pageUrls.push(albumListUrl)
			}
		})
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

				if (albumName.endsWith("...")) {
					let title
					this.get(albumUrl).then(res => {
						let $ = cheerio.load(res.text)
						$('.numBox').remove()
						albumName = $("b[class=c6]").text()
						this.handleAlbum(new Album(albumName, albumUrl))
					})
				} else {
					this.handleAlbum(new Album(albumName, albumUrl))
				}

			})
		})
	}

	handleAlbum(album) {
		console.log(album.name, album.url)
		this.get(album.url).then(res => {
			let pageUrls=this.parseAlbumSubPageUrls(res.text)
			if(pageUrls.length===0){
				pageUrls.push(album.url)
			}
			for(let pageUrl of pageUrls){
				//console.log(">>>>",pageUrl)
				this.handleOneAlbumPagePhotos(album.name,pageUrl)
			}
		})
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

		if(!fs.existsSync(rootPhotoDir)){
			fs.mkdirSync(rootPhotoDir);
		}

		const albumPath=path.join(rootPhotoDir,albumName);

		if(!fs.existsSync(albumPath)){
			fs.mkdirSync(albumPath);
		}

		const filePath=`${rootPhotoDir}/${albumName}/${photoName}.jpg`

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