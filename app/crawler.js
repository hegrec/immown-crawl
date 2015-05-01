var Api = require('immodispo-api-client'),
    _ = require('lodash'),
    async = require('async'),
    env = require('./env');

function Crawler(sources, logger, tracker) {
    this.sources = sources;
    this.logger = logger;
    this.tracker = tracker;
    this.towns = [];
    this.LISTINGS_MAX = 100000;
    this.api = new Api(env.api.username, env.api.password);
}

/**
 * Sources are added to the list here and processed, names match the filename of the module
 */
Crawler.prototype.runCrawler = function run() {
    var self = this;

    var onlyAfterDate = this.dateToAPIFormat(Date.now() - 86400000);

    var tasks = [];
    _.forOwn(self.sources, function (source) {
        var task = function(cb) {
            self.processSource(source, cb);
        };
        tasks.push(task);
    });

    async.parallel(tasks, function(err, result) {
       self.callback(err, result);
    });
};

Crawler.prototype.dateToAPIFormat = function(date) {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
};
        /**
 * Process all towns for a given source asyncronously
 * @param {Scraper} source
 */
Crawler.prototype.processSource = function processTown(source, cb) {
    var self = this,
        tasks = [];

    _.each(this.towns, function(town) {

        var task = function(cb) {
            source.scrape(town, cb);
        };

        tasks.push(task);
    });

    //each town task will happen one at a time per source
    async.series(tasks, function(err, result) {

        //err should only be filled in catastrophic scenarios
        // scraper tasks should log minor errors and return null
        //this lets scraper proceed to the next task
        if (err) {
            self.logger.log('error', err);
        } else {
            self.logger.log('Crawling complete for source ' + source.getScraperName());
        }
        cb(err, result);
    });
};

/**
 * Initiates the crawling process for all sources
 */
Crawler.prototype.crawl = function crawl(cb) {

    var self = this,
        crawlCount = 250;
    self.callback = cb;
    this.tracker.event('crawler', 'crawler.start', function(err) {

    });
    self.logger.log("Starting Node.js Crawler for "+ crawlCount + " towns");

    //find the 100 most populous towns and order them randomly for processing
    var startPos = Math.floor(Math.random() * (36777-crawlCount));
    this.api.get(env.API_HOST + "/towns?sort=-population&limit=" + crawlCount + "&start="+startPos, function(err, biggestTowns) {
        var townQueue = [],
            ndx;

        if (err) {
            self.logger.log("error", err);
        }

        biggestTowns = biggestTowns.body;

        while (biggestTowns.length > 0) {
            ndx = Math.floor(Math.random() * biggestTowns.length);
            townQueue.push(biggestTowns.splice(ndx,1)[0]);
        }
        self.towns = townQueue;

        self.api.get(env.API_HOST + "/listings?limit=1", function(err, listings) {
            if (listings.meta.total < self.LISTINGS_MAX) {
                self.runCrawler();
            } else {
                self.logger.log(listings.meta.total + " listings above maximum " + self.LISTINGS_MAX);
                process.exit();
            }
        });
    });
};

module.exports = Crawler;
