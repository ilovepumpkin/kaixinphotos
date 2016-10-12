import KaixinCrawler from './module/crawler.js'
import Album from './module/album.js'

const argv=process.argv
if(argv.length < 3){
	console.error("Album name is required.");
}else{
	let kxCrawler = new KaixinCrawler()
	kxCrawler.downAlbum(argv[2])
}

