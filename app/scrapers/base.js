var Crawler = require("crawler").Crawler;
var utils = require("../util");
var fs = require('fs');
var env = require("../env");
var url = require('url');
var http = require('http');
function Scraper(Models) {

    this.Models = Models;

    this.next = function () {} //when we run out of tasks and fully yield to the event loop

}

/**
 * Retrieve a set of listing URLs for a given town to further parse
 * @param town
 */
Scraper.prototype.scrape =  function(town,next) {
    this.town = town;
    this.next = next;
    var self = this;
    this.crawler = new Crawler({
        "maxConnections": 1,
        "callback": function(err,result,$) {

            self.initial_fetch(err,result,$) }
    });
    var initial = this.initial_url();
    this.crawler.queue(initial);

};

Scraper.prototype.scrape_urlpage = function(result,$) {

};

Scraper.prototype.initial_fetch = function (error, result, $) {
    this.listing_urls = [];
    this.cookie_string = "";

    var cookies = [];
    for (var i = 0; i < result.headers["set-cookie"].length; i++) {
        cookies.push(result.headers["set-cookie"][i].split(" ")[0])
    }

    this.cookie_string = cookies.join(" ");
    this.scrape_urlpage(result,$);
};


Scraper.prototype.initial_url = function() {

};
/**
 * Called appropriately when the processing sequence begins or a previous listing finished processing
 * Asyncronously runs the next processing task for the given listing URL at the head of the queue
 */
Scraper.prototype.handleListings = function() {

    var listingURL = this.listing_urls[0];
    this.listing_urls = this.listing_urls.splice(1);
    this.handleListing(listingURL,false)
};

/**
 * Creates a listing in the database according to the current listing_model
 */
Scraper.prototype.createListing = function () {
    var self = this;
    this.Models.Listing.create(this.listing_model, function (err, item) {
        if (err) throw err
        var listing_id = item.id;
        for (var i=0;i<self.listingImages.length;i++) {
            self.saveListingImage(self.listingImages[i],listing_id)
        }
        self.handleListings();
    });
};

Scraper.prototype.saveListingImage = function(img_url,listing_id) {
    var fileName = utils.getImagefileName(img_url);
    var self = this;
    var options = {
        host: url.parse(img_url).host,
        port: 80,
        path: url.parse(img_url).pathname,
        headers: {
            "Cookie":self.cookie_string
        }
    };
    var listingimage_model = {
        "image":fileName,
        "listing_id":listing_id
    };
    var file = fs.createWriteStream(env.DOWNLOAD_DIR + fileName);

    http.get(options, function(res) {
        res.on('data', function(data) {
            file.write(data);
        }).on('end', function() {
            file.end();
            self.Models.ListingImage.create(listingimage_model, function (err, items) {

            });
        });
    });
};

Scraper.prototype.createAgency = function(agency_town) {
    var self = this;
    this.Models.Town.find({"town_name": agency_town}, function (err, items) {
        // err - description of the error or null
        // items - array of inserted items
        if (err) throw err;
        if (items.length < 1) {
            console.log("FAILED SEARCH TOWN FOR NEW AGENCY: "+agency_town);
            self.handleListings();
            return;
        }
        self.agency_model.town_id = items[0].id;
        self.agency_model.name = self.getScraperName()+" "+items[0].town_name;
        self.Models.Agency.create(self.agency_model, function (err, new_agency) {
            // err - description of the error or null
            // items - array of inserted items
            if (err) throw err;
            self.listing_model.agency_id = new_agency.id;
            self.createListing();
        });
    });
};

Scraper.prototype.getScraperName = function() {
    return "Base Scraper"
};

/**
 * Parse a single listing for data to pass back to ORM
 * @param url
 * @param town
 * @param rental
 */
Scraper.prototype.handleListing = function (url,rental) {

    if (url == null) {
        console.log("Town complete for source: "+this.getScraperName());
        return this.next(); //this is where it actually moves to the next town for this source (yields to a callback set before it all began,
        // it's callbacks all the way down
    }
    var self = this;
    this.Models.Listing.find({listing_url:url}, function (err, items) {
        // err - description of the error or null
        // items - array of inserted items

        if (err) throw err;

        if (items.length == 0) {
            console.log("Fetching URL For Source ("+self.getScraperName()+"): "+url);
            self.crawler.queue({
                "uri": self.getURL()+url,
                "callback":function(err,response,$){
                    try {
                        self.processListing(err,response,$,url,rental)
                    } catch (e) {
                        console.log(e);
                        self.handleListings()
                    }
                },
                "headers":{"Cookie":self.cookie_string}});
        } else {
            self.handleListings()
        }
    });
};

Scraper.prototype.handleListings = function () {
    var listingURL = this.listing_urls[0];
    this.listing_urls = this.listing_urls.splice(1);
    this.handleListing(listingURL,false) //TODO: map this to a boolean tied to rent in the 1st phase of url scanning
};

Scraper.prototype.processListing = function(response, $, url,rental) {

};

Scraper.prototype.getURL = function() {
    return "";
};

Scraper.prototype.listing_defaults = function() {
    return {
        found_date: new Date,
        updated_date: new Date,
        has_garden: false,
        has_pool: false,
        has_kitchen: false,
        in_subdivision: false,
        is_rental: false,
        views: 0
    };
};

Scraper.prototype.agency_defaults = function() {
    return {
        street_address: "",
        website: ""
    };
};

/**
 * Check the source URL of a given listing to verify it is on the source website
 * @param url
 */
Scraper.prototype.checkListingStillExists = function (url) {

};

module.exports = Scraper;