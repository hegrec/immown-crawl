var Crawler = require("crawler").Crawler,
    utils = require("../util"),
    _ = require('lodash'),
    env = require("../env"),
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
 */
Scraper.prototype.scrapeUrlPage = function(result, $, cb) {};

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

        self.crawler.queue({
            uri: self.initialUrl(),
            callback: function (err, result, $) {

                if (err) {

                    self.logger.log('error', err);
                    return cb(null, null);
                } else {

                    self.initialFetch(err, result, $)
                }
            }
        });
    });
};

Scraper.prototype.setCookies = function(cookies) {
    var cookieData = [];

    this.cookieString = '';

    _.each(cookies , function(cookie) {
        cookieData.push(cookie.split(' ')[0]);
    });

    this.cookieString = cookieData.join(' ');
};

/**
 * Fetch the intitial URL and start the scraping process
 * @param error
 * @param result
 * @param $
 */
Scraper.prototype.initialFetch = function (error, result, $) {

    var self = this;

    this.listingUrls = [];
    this.setCookies(result.headers['set-cookie']);

    var onScrapedListingUrls = function(err, result) {

        self.logger.log(self.listingUrls.length + ' urls for town '
            + self.town.name + ' (' + self.town.code + ') from ' + self.pages + ' pages');

        self.handleListings();
    };

    this.scrapeUrlPage(result, $, onScrapedListingUrls);
};

/**
 * Called appropriately when the processing sequence begins or a previous listing finished processing
 * Asynchronously runs the next processing task for the given listing URL at the head of the queue
 */
Scraper.prototype.handleListings = function () {

    var self = this,
        tasks = [];

    _.each(this.listingUrls, function(listingUrl) {

        var task = function(cb) {
            var encodedURL = encodeURIComponent(listingUrl),
                nowTime;

            self.api.get(env.API_HOST + '/listings?filter=listing_url=' + encodedURL, function (err, items) {
                var onProcessedListing = function(err, savedListing) {
                    var elapsed = new Date().getTime() - nowTime;

                    self.tracker.timing('crawler', 'crawler.processUrl', elapsed, listingUrl);
                    cb(err, savedListing);
                },
                time = new Date().getTime(),
                isRental = false; //TODO: map this to a boolean tied to rent in the 1st phase of url scanning

                if (err) {

                    self.logger.log('error', err);
                    return cb(null, null);
                }

                //if we already have this listing stored, skip to the next one
                if (items.body.length == 0) {
                    self.tracker.event('crawler', 'crawler.scrapeUrl', listingUrl, function(err) {

                    });

                    self.handleListing(listingUrl, isRental, function(err, listingModelData) {
                        nowTime = new Date().getTime();
                        var elapsed = nowTime - time;
                        self.tracker.timing('crawler', 'crawler.scrapeUrl', elapsed, listingUrl);
                        if (err) {

                            self.logger.log('error', err);
                            return cb(null, null);
                        }

                        self.saveNewListing(listingModelData, onProcessedListing);
                    });

                } else {
                    self.tracker.event('crawler', 'crawler.skipUrl', listingUrl, function(err) {

                    });
                    self.logger.log('Listing ' + listingUrl + ' exists, moving on...');
                    cb(null, null);
                }
            });
        };

        tasks.push(task);
    });

    //each town task will happen one at a time per source
    async.series(tasks, function(err, result) {

        if (err) {
            self.logger.log('error', err);
        } else {
            self.logger.log('Town ' + self.town.name + ' complete for source: ' + self.getScraperName());
            return self.cb(null, null);
        }
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
                self.logger.log("error", err);
                return cb(err);
            }

            try {

                self.processListing(listingModel, $, url, rental, cb)
            } catch (e) {

                self.logger.log('error', e + '\r\n' + e.stack);
                return cb(e);
            }
        },
        headers: {
            Cookie: self.cookieString
        }
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
            headers: {
                Cookie: this.cookieString
            }
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
