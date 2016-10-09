import KaixinCrawler from './module/crawler.js'
import Album from './module/album.js'

let kxCrawler = new KaixinCrawler()
let album=new Album("UK - London 2","http://www.kaixin001.com/photo/album.php?uid=2583910&albumid=29506856")
kxCrawler.handleAlbum(album)
