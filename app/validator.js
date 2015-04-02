var Api = require('immodispo-api-client'),
    _ = require('lodash'),
    async = require('async'),
    env = require('./env');

function Validator(sources, logger, tracker) {
    this.api = new Api(env.api.username, env.api.password);
    this.sources = sources;
    this.logger = logger;
    this.tracker = tracker;
    this.DAY_MILLISECONDS = 7*86400000;
}
Validator.prototype.validate = function verifyData(next) {
    var self = this,
        validationTasks = [];

    _.each(this.sources, function(source) {
        var task = function(cb) {
            self.validateSource(source, cb);
        };
        validationTasks.push(task);
    });


    var onlyAfterDate = this.dateToAPIFormat(Date.now() - self.DAY_MILLISECONDS);

    this.api.get(env.API_HOST + "/listings?limit=1&filter=updatedAt<"
        + encodeURIComponent(onlyAfterDate), function(err, listings) {
        self.tracker.event('validator', 'validator.start', 'number to validate', listings.meta.total, function(err) {

        });
        self.logger.log(listings.meta.total + ' listings need validation');
        async.parallel(validationTasks, function (err, result) {
            next(err, result);
        });
    });
};

Validator.prototype.validateSource = function validateSource(source, cb) {
    var self = this;
    self.fetchListingURLsForUpdate(source.getURL(), function(err, gatheredListings) {
        if (gatheredListings === false) {
            self.logger.log('error', 'fetchListingURLsForUpdate failed ' + source.getURL());
        } else if (gatheredListings.length === 0) {
            return cb(null, true);
        }

        self.verifyListingsForSource(source, gatheredListings, function() {
            self.validateSource(source, cb);
        });
    });
};

Validator.prototype.verifyListingsForSource = function (source, listingsToVerify, next) {
    var self = this,
        listingTasks = [];

    _.each(listingsToVerify, function(listing) {
        var listingTask = function (cb) {
            self.processSourceQueue(source, listing, cb);
        };

        listingTasks.push(listingTask);
    });

    //will start with task 0 per source and proceed until no more tasks before returning
    async.series(listingTasks, function(err, result) {
        next(err, result);
    });
};

Validator.prototype.processSourceQueue = function (source, listing, cb) {
    var self = this;

    source.handleListing(
        listing.listing_url,
        listing.is_rental,
        function(err, listingModelData) {
            var savable = {}; //send no data and just update the updatedAt inside the API

            if (err) {
                self.logger.log('error', err);
                //error during processing a listing which previously successfully saved
                //TODO: further validate that the error is actually that it doesn't exist
                //page structure changing can trigger an error as well
                self.api.remove(env.API_HOST + '/listings/' + listing.id, function(err, result) {
                    cb(err, result);
                });
            } else {
                //for now just update the fact that it still exists
                self.api.put(env.API_HOST + '/listings/' + listing.id, savable, function(err, result) {
                    cb(err, result);
                });
            }
        }
    );
};

Validator.prototype.dateToAPIFormat = function(date) {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
};

Validator.prototype.fetchListingURLsForUpdate = function (sourceUrl, cb) {
    var self = this,
    onlyAfterDate = self.dateToAPIFormat(Date.now() - self.DAY_MILLISECONDS);

    self.api.get(env.API_HOST + "/listings?sort=updatedAt&limit=50&include=Agency,ListingImage,ListingDetail&filter=listing_url~>"
        + sourceUrl
        + "&filter=updatedAt<"
        + encodeURIComponent(onlyAfterDate), function(err, listings) {
        var container = [];

        if (err) {
            return cb(null, false);
        }

        _.each(listings.body, function(listing) {
            container.push(listing);
        });

        cb(null, container);
    });
};

module.exports = Validator;