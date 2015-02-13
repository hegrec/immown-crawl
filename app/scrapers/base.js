var Crawler = require("crawler").Crawler,
    utils = require("../util"),
    _ = require('lodash'),
    env = require("../env"),
    api = require('immodispo-api-client'),
    DomainListing = require('./../domain/Listing'),
    DomainListingImage = require('./../domain/ListingImage'),
    DomainListingDetail = require('./../domain/ListingDetail'),
    DomainAgency = require('./../domain/Agency'),
    url = require('url'),
    async = require('async'),
    http = require('http');

/**
 *
 * @param logger
 * @constructor
 */
function Scraper(logger) {
    this.next = function () {}; //when we run out of tasks and fully yield to the event loop
    this.logger = logger;
    this.listingModel = new DomainListing();
    this.listingDetails = [];
    this.listingImages = [];
}

/**
 * Retrieve a set of listing URLs for a given town to further parse
 * @param town
 */
Scraper.prototype.scrape = function(town, next) {
    var self = this;

    this.town = town;
    this.next = next;

    this.crawler = new Crawler({
        "maxConnections": 1,
        "callback": function(err, result, $) {
            if (err) {
                self.logger.log("error", err);
                next();
            } else {
                self.initialFetch(err, result, $)
            }
        }
    });

    this.crawler.queue(this.initialUrl());
};

/**
 * Override this when creating a new source scraper
 * @param result
 * @param $
 */
Scraper.prototype.scrapeUrlPage = function(result, $) {};

/**
 * Return the initial URL to scrape
 */
Scraper.prototype.initialUrl = function() {};

/**
 * Get a friendly name for the source
 * @returns {string}
 */
Scraper.prototype.getScraperName = function() {};

/**
 * Get the base URL for a source
 * @returns {string}
 */
Scraper.prototype.getURL = function() {};

/**
 * Fetch the intitial URL and start the scraping process
 * @param error
 * @param result
 * @param $
 */
Scraper.prototype.initialFetch = function (error, result, $) {
    var cookies = [];

    this.listingUrls = [];
    this.cookieString = "";

    _.each(result.headers['set-cookie'] , function(cookie) {
        cookies.push(cookie.split(" ")[0]);
    });

    this.cookieString = cookies.join(" ");
    this.scrapeUrlPage(result,$);
};

/**
 * Called appropriately when the processing sequence begins or a previous listing finished processing
 * Asynchronously runs the next processing task for the given listing URL at the head of the queue
 */
Scraper.prototype.handleListings = function () {
    var listingURL,
        self = this;

    if (this.listingUrls.length < 1) {
        console.log("Town complete for source: "+this.getScraperName());
        return this.next(); //this is where it actually moves to the next town for this source (yields to a callback set before it all began,
        // it's callbacks all the way down
    }

    listingURL = this.listingUrls[0];
    this.listingUrls = this.listingUrls.splice(1);

    var encodedURL = encodeURIComponent(listingURL);

    api.get(env.API_HOST + '/listings?filter=listing_url=' + encodedURL, function (err, items) {
        if (err) {
            self.logger.log("error", err);
            setImmediate(function() {
                self.handleListings()
            });
            return;
        }

        //if we already have this listing stored, skip to the next one
        if (items.body.length == 0) {
            self.handleListing(listingURL,false); //TODO: map this to a boolean tied to rent in the 1st phase of url scanning
        } else {
            self.logger.log("info", "Listing "+listingURL+" exists, moving on...");
            setImmediate(function() {
                self.handleListings()
            });
        }
    });
};

/**
 * Parse a single listing for data to pass back to the api
 * @param url
 * @param town
 * @param rental
 */
Scraper.prototype.handleListing = function (url, rental) {
    var self = this;

    console.log("Fetching URL For Source ("+self.getScraperName()+"): "+url);
    self.crawler.queue({
        "uri": url,
        "callback":function(err, response, $) {
            try {
                if (err) {
                    self.logger.log("error", err);
                    setImmediate(function() {
                        self.handleListings()
                    });
                    return;
                }
                //Setup defaults for the listing about to be processed
                self.listingModel = new DomainListing();
                self.agencyModel = new DomainAgency();
                self.listingImages = [];
                self.listingDetails = {};

                self.processListing(response, $, url, rental)
            } catch (e) {
                self.logger.log('error', e);
                setImmediate(function() {
                    self.handleListings()
                });
            }
        },
        "headers":{
            "Cookie":self.cookieString
        }
    });
};

/**
 * Abstract method implementing the processing function
 * @param response
 * @param $
 * @param url
 * @param rental
 */
Scraper.prototype.processListing = function(response, $, url,rental) {};

/**
 * Sends a listing to the API
 */
Scraper.prototype.createListing = function () {
    var self = this;

    api.post(env.API_HOST + '/listings', this.listingModel, function (err, item) {
        var listingId;

        if (err) {
            self.logger.log("error", err);
            setImmediate(function() {
                self.handleListings()
            });
            return;
        }

        listingId = item.id;
        var subTasks = [];
        _.each(self.listingImages, function(listingImage) {
            subTasks.push(function(cb) {
                self.saveListingImage(listingImage, listingId, cb);
            });
        });

        _.forOwn(self.listingDetails, function(value, key) {
            subTasks.push(function(cb) {
                self.saveListingDetail(key, value, listingId, cb);
            });
        });

        async.parallel(subTasks, function(err, results) {
            self.handleListings();
        });

    });
};

Scraper.prototype.saveListingImage = function(imageUrl,listingId,cb) {
    var fileName = utils.getImageExtension(imageUrl),
        options = {
            host: url.parse(imageUrl).host,
            port: 80,
            path: url.parse(imageUrl).pathname,
            headers: {
                "Cookie":this.cookieString
            }
        };

    var data = [];
    http.get(options, function(res) {
        res.on('data', function(chunk) {
            data.push(chunk);
        }).on('end', function() {
            var imageData = {
                "extension":fileName,
                "buffer":Buffer.concat(data).toString('base64')
            };

            api.post(env.API_HOST + '/listings/' + listingId + '/images', imageData, function (err, items) {
                if (err) {
                    return cb(err);
                }

                cb(null, items);
            });
        });
    });
};

Scraper.prototype.saveListingDetail = function(key, value, listingId, cb) {
    var listingDetailSavable = {
        key: key,
        value: value
    };

    api.post(env.API_HOST + '/listings/' + listingId + '/details', listingDetailSavable, function (err, items) {
        if (err) {
            return cb(err);
        }

        cb(null, items);
    });
};

Scraper.prototype.createAgency = function(agencyModel) {
    var self = this;
    console.log(agencyModel.name);

    api.post(env.API_HOST + "/agencies", agencyModel, function (err, savedAgency) {

        if (err) {
            self.logger.log("error", err);
        }

        self.listingModel.AgencyId = savedAgency.id;
        self.createListing();

    });
};

module.exports = Scraper;