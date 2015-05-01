var Crawler = require("crawler"),
    utils = require("../util"),
    _ = require('lodash'),
    env = require("../env"),
    constants = require('../constants'),
    Api = require('immodispo-api-client'),
    DomainListing = require('./../domain/Listing'),
    url = require('url'),
    async = require('async'),
    http = require('http');

/**
 *
 * @param logger
 * @param tracker
 * @param redis
 * @constructor
 */
function Scraper(logger, tracker, redis) {
    this.logger = logger;
    this.tracker = tracker;
    this.redis = redis;
    this.crawler = new Crawler({
        maxConnections: 1
    });
    this.api = new Api(env.api.username, env.api.password);
}

/**
 * Used for any possible async tasks prior to scraping a source
 * @param cb
 */
Scraper.prototype.preScrape = function(cb) {
    setImmediate(function () {
        cb(null, null);
    })
};

/**
 * Override this when creating a new source scraper
 * @param result
 * @param $
 * @param cb
 * @param rent
 */
Scraper.prototype.scrapeUrlPage = function(result, $, cb, rent) {};

/**
 * Return the initial URL to scrape
 */
Scraper.prototype.initialUrl = function() {};

/**
 * Return the initial rent URL to scrape
 */
Scraper.prototype.initialRentUrl = function() {};

/**
 * Return the headers to use in the crawler
 */
Scraper.prototype.getHeaders = function() {};
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
 * Abstract method implementing the processing function
 * @param {DomainListing} listingModel A blank listing model supplied for filling
 * @param $
 * @param url
 * @param rental
 * @param cb
 */
Scraper.prototype.processListing = function(listingModel, $, url, rental, cb) {};

/**
 * Retrieve a set of listing URLs for a given town to further parse
 * @param town
 * @param cb
 */
Scraper.prototype.scrape = function(town, cb) {

    var self = this;

    this.town = town;
    this.cb = cb;

    self.preScrape(function (err, result) {
        if (err) {
            self.logger.log('error', err);
            return cb(null, null);
        }

        var purchaseScrapeTask = function(cb) {
            self.crawler.queue({
                uri: self.initialUrl(),
                callback: function (err, result, $) {

                    if (err || !$) {

                        self.logger.log('error', err);
                        return cb(null, null);
                    } else {

                        self.initialFetch(result, $, cb, false)
                    }
                },
                headers: self.getHeaders()
            });
        };

        var rentScrapeTask = function(cb) {
            self.crawler.queue({
                uri: self.initialRentUrl(),
                callback: function (err, result, $) {

                    if (err || !$) {

                        self.logger.log('error', err);
                        return cb(null, null);
                    } else {

                        self.initialFetch(result, $, cb, true)
                    }
                },
                headers: {
                    Cookie: self.cookieString
                }
            });
        };

        async.series([purchaseScrapeTask, rentScrapeTask], function(err, result) {
           async.series([
               function(cb) {
                   self.handleListings(result[0], false, cb);
               },
               function(cb) {
                   self.handleListings(result[1], true, cb);
               }
           ], function(err, result) {
                self.cb(null, null);
           })
        });
    });
};

Scraper.prototype.setCookies = function(cookies) {
    var cookieData = [];

    this.cookieString = '';

    _.each(cookies , function(cookie) {
        cookieData.push(cookie.split(' ')[0]);
    });

    this.cookieString = cookieData.join('; ');
};

/**
 *
 * @param result
 * @param $
 * @param cb
 * @param rent
 */
Scraper.prototype.initialFetch = function (result, $, cb, rent) {


    var self = this;

    this.listingUrls = [];
    this.setCookies(result.headers['set-cookie']);

    var onScrapedListingUrls = function(err, result) {
        var rentalString = " purchases";

        result = [];

        _.each(self.listingUrls, function(url) {
            result.push(url);
        });

        self.listingUrls = [];

        if (rent) {
            rentalString = " rentals";
        }

        if (result.length) {
            self.logger.log(self.getScraperName() + ' ' + result.length + rentalString + ' for town '
                + self.town.name + ' (' + self.town.code + ')');
        }
        cb(null, result);
    };

    this.scrapeUrlPage(result, $, onScrapedListingUrls, rent);
};

/**
 * Called appropriately when the processing sequence begins or a previous listing finished processing
 * Asynchronously runs the next processing task for the given listing URL at the head of the queue
 */
Scraper.prototype.handleListings = function (listingUrls, isRental, cb) {

    var self = this,
        tasks = [];

    _.each(listingUrls, function(listingUrl) {

        var task = function(cb) {
            var encodedURL = encodeURIComponent(listingUrl),
                nowTime;

            self.api.get(env.API_HOST + '/listings?filter=listing_url=' + encodedURL, function (err, items) {
                var onProcessedListing = function(err, savedListing) {
                    var elapsed = new Date().getTime() - nowTime;

                    self.tracker.timing('crawler', 'crawler.processUrl', elapsed, listingUrl);
                    cb(err, savedListing);
                },
                time = new Date().getTime();

                if (err) {
                    self.logger.log('error', err);
                    return cb(null, null);
                }

                //if we already have this listing stored, skip to the next one
                if (items.body.length == 0) {
                    self.tracker.event('crawler', 'crawler.scrapeUrl', listingUrl, function(err) {});

                    self.handleListing(listingUrl, isRental, function(err, listingModelData) {
                        nowTime = new Date().getTime();
                        var elapsed = nowTime - time;
                        self.tracker.timing('crawler', 'crawler.scrapeUrl', elapsed, listingUrl);
                        if (err) {

                            self.logger.log('error', err);
                            return cb(err, null);
                        } else if (listingModelData) {

                            if (listingModelData.land_size && listingModelData.interior_size) {
                                listingModelData.construction_type = constants.CONSTRUCTION_TYPE_HOUSE;
                            }

                            self.saveNewListing(listingModelData, onProcessedListing);
                        } else {
                            cb(null, null);
                        }
                    });

                } else {
                    self.tracker.event('crawler', 'crawler.skipUrl', listingUrl, function(err) {

                    });
                    cb(null, null);
                }
            });
        };

        tasks.push(task);
    });

    //each town task will happen one at a time per source
    async.series(tasks, function(err, result) {

        cb(null, null);
    });
};

/**
 * Parse a single listing for data to pass back to the api
 * @param url
 * @param rental
 * @param cb
 */
Scraper.prototype.handleListing = function (url, rental, cb) {

    var self = this;

    self.logger.log('Fetching URL For Source (' + self.getScraperName() + '): ' + url);

    self.crawler.queue({
        uri: url,
        callback: function(err, response, $) {
            var listingModel = new DomainListing();

            if (err) {
                return cb(err);
            }

            try {
                if (rental) {
                    listingModel.is_rental = 1;
                }
                self.processListing(listingModel, $, url, rental, cb)
            } catch (e) {

                self.logger.log('error', e + '\r\n' + e.stack);
                return cb(e);
            }
        },
        headers: self.getHeaders()
    });
};

Scraper.prototype.saveNewListing = function completedProcessing(listingModelData, cb) {
    var encodedAddress = encodeURIComponent(listingModelData.agency.address_1),
        self = this;

    self.api.get(env.API_HOST + '/agencies?filter=address_1=' + encodedAddress, function (err, agencies) {

        var onSavedListing = function(err, listing) {

            cb(err, listing);
        };

        var onFetchedAgency = function(err, agency) {

            if (err) {
                self.logger.log("error", err);
                return cb(err);
            }

            listingModelData.AgencyId = agency.id;
            self.createListing(listingModelData, onSavedListing);
        };

        if (agencies.body.length == 0) {

           self.createAgency(listingModelData.agency, onFetchedAgency)
        } else {

            onFetchedAgency(err, agencies.body[0]);
        }
    });
};


/**
 * Send an agency model to the api
 * @param {Agency} agencyModel
 * @param cb function
 */
Scraper.prototype.createAgency = function(agencyModel, cb) {
    var self = this,
        savableAgency = {
            name: agencyModel.name,
            image: agencyModel.image,
            address_1: agencyModel.address_1,
            address_2: agencyModel.address_2,
            telephone: agencyModel.telephone,
            email: agencyModel.email,
            website: agencyModel.website,
            TownId: agencyModel.TownId
        };

    self.api.post(env.API_HOST + '/agencies', savableAgency, function (err, savedAgency) {

        if (err) {
            return cb(err);
        }

        return cb(null, savedAgency);

    });
};

/**
 * Sends a listing to the API
 */
Scraper.prototype.createListing = function (listingModel, cb) {
    var self = this,
        savableListing = {
            description: listingModel.description,
            price: listingModel.price,
            num_rooms: listingModel.num_rooms,
            num_bathrooms: listingModel.num_bathrooms,
            num_bedrooms: listingModel.num_bedrooms,
            construction_type: listingModel.construction_type,
            listing_url: listingModel.listing_url,
            latitude: listingModel.latitude,
            longitude: listingModel.longitude,
            land_size: listingModel.land_size,
            interior_size: listingModel.interior_size,
            total_size: listingModel.total_size,
            year_built: listingModel.year_built,
            is_rental: listingModel.is_rental,
            TownId: listingModel.TownId,
            AgencyId: listingModel.AgencyId
        };

    self.api.post(env.API_HOST + '/listings', savableListing, function (err, item) {
        var listingId;

        if (err) {
            return cb(err);
        }

        listingId = item.id;
        var subTasks = [];
        _.each(listingModel.images, function(imageUrl) {
            subTasks.push(function(cb) {
                self.saveListingImage(imageUrl, listingId, cb);
            });
        });

        _.forOwn(listingModel.details, function(value, key) {
            subTasks.push(function(cb) {
                self.saveListingDetail(key, value, listingId, cb);
            });
        });

        async.parallel(subTasks, function(err, results) {
            cb(null, item);
        });

    });
};

Scraper.prototype.saveListingImage = function(imageUrl, listingId, cb) {
    var fileName = utils.getImageExtension(imageUrl),
        self = this,
        options = {
            host: url.parse(imageUrl).host,
            port: 80,
            path: url.parse(imageUrl).pathname,
            headers: self.getHeaders()
        },
        data = [];

    http.get(options, function(res) {

        res.on('data', function(chunk) {

            data.push(chunk);
        }).on('end', function() {

            var imageData = {
                "extension":fileName,
                "buffer":Buffer.concat(data).toString('base64')
            };

            self.api.post(env.API_HOST + '/listings/' + listingId + '/images', imageData, function (err, items) {

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

    this.api.post(env.API_HOST + '/listings/' + listingId + '/details', listingDetailSavable, function (err, items) {
        if (err) {
            return cb(err);
        }

        cb(null, items);
    });
};

module.exports = Scraper;
