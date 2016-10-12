import KaixinCrawler from './module/crawler.js'

let uid=process.argv.length>2?process.argv[2]:undefined

let kxCrawler = new KaixinCrawler(uid)
kxCrawler.start()