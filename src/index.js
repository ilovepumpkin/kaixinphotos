'use strict'
import req from 'superagent'
import cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'

const albumListUrl = 'http://www.kaixin001.com/photo/albumlist.php'
const domainName="http://www.kaixin001.com"
const rootPhotoDir="开心网相册"

class Album {
	constructor(name, url) {
		this.name = name
		this.url = url
	}
}

class Photo{
	constructor(name, pageUrl){
		this.name=name
		this.pageUrl=pageUrl
	}
}

class KaixinCrawler {

	constructor() {
		this.cookie=this.readCookie()
		console.log(this.cookie);
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
		console.log(album.name)
		this.get(album.url).then(res => {
			const pageUrls=this.parseAlbumSubPageUrls(res.text)
			for(let pageUrl of pageUrls){
				// console.log(">>>>",pageUrl)
				this.handleOneAlbumPagePhotos(album.name,pageUrl)
			}
		})
	}

	handleOneAlbumPagePhotos(albumName,pageUrl){
		this.get(pageUrl).then(res=>{
			let $ = cheerio.load(res.text)
			$('div[class=initimgName]').each((idx, elem) => {
				const nameLink=$(elem).children()
				const photoName=nameLink.attr('title')
				const photoPageUrl=domainName+nameLink.attr('href')


				let uid=photoPageUrl.match("uid=([0-9]+)&")[1]
				let pid=photoPageUrl.match("pid=([0-9]+)&")[1]
				let path1=pid.substr(3,2)
				let path2=pid.substr(5,2)

				let photoUrl=`http://p.kaixin001.com/privacy/photo/${path1}/${path2}/${uid}_${pid}_w1280p.jpg`
				this.download(albumName,photoName,photoUrl)
			})
		})

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

let kxCrawler = new KaixinCrawler()
kxCrawler.start()
