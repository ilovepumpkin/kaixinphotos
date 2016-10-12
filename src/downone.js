import KaixinCrawler from './module/crawler.js'
import Album from './module/album.js'

const argv=process.argv
if(argv.length < 3){
	console.error("Album name is required.");
}else{
	let uid=process.argv.length>3?process.argv[3]:undefined
	let kxCrawler = new KaixinCrawler(uid)
	kxCrawler.downAlbum(argv[2])
}

