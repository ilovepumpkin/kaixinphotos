'use strict'
import req from 'superagent'
import cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import http from 'http'

let cookie = '_vid=C697B0676090000119B31E19FE909DE0; _ref=57f72e6a2a474; _cpmuid=1069473622; _user=1b0fa3c45d5dd63683573089e1b9d63e_2583910_1475817079; _uid=2583910; _email=merrychristmas_2002%40hotmail.com; _laid=0; _kx=MjU4MzkxMDpsZGdzYnIyNzc3cjQ6dm41eWZ5eXk5MWo0ZHZocWJzaXo2eW8wa3J6ZXE0cHZicGMw; _sso=2583910; SERVERID=_srv220-42_; onlinenum=c%3A0; wpresence=Fl4Rn7CSgV2JrUb8vyBj11CpGxbDf1VoV_dUIA.ZGZ0MjU4MzkxMA'

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

	constructor() {}

	start() {
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
				const photoName=nameLink.text()
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
			this.get(photoUrl).pipe(file)
			console.log(`${filePath} is downloaded.`)
		}else{
			//console.log(`${filePath} already exists.`)
		}
	}

	get(url) {
		return req.get(url).set('Cookie', cookie)
	}

}

let kxCrawler = new KaixinCrawler()
kxCrawler.start()
