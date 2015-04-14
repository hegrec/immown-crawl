var api = require('immodispo-api-client'),
    Base = require("./base"),
    async = require('async'),
    util = require('./../util'),
    constants = require('./../constants');

function LaForet(logger, tracker, redis) {

    Base.call(this, logger, tracker, redis);
    this.pages = 1;
}

LaForet.prototype = Object.create(Base.prototype);

LaForet.prototype.getHeaders = function() {
    var headers = {};

    headers['DNT'] = 1;
    headers['Host'] = 'www.laforet.com';
    headers['Referer'] = 'http://www.laforet.com/';
    headers['Connection'] = 'keep-alive';
    headers['Cookie'] = this.cookieString;
    headers['Cache-Control'] = 'max-age=0';
    headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
    headers['Accept-Encoding'] = 'gzip, deflate, sdch';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    headers['Accept-Language'] = 'en-CA,en;q=0.8,en-US;q=0.6,fr;q=0.4,fr-FR;q=0.2';
    headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.89 Safari/537.36';

    return headers;
};

LaForet.prototype.scrapeUrlPage = function (result, $, cb, rent) {
    var self = this,
        selector = $('li.draggable'),
        nextPage = selector.length,
        nextPageHeaders = self.getHeaders();

    selector.each(function (index, li) {
        var $li = $(li),
            jsonData = $li.data('json'),
            numPics = jsonData.picturesLetters.length;

        if (!numPics || numPics < constants.MINIMUM_IMAGES) {
            return;
        }

        self.listingUrls.push(self.getURL() + jsonData.url);
    });

    if (nextPage && ++this.pages < 50) {
        self.crawler.queue({
            uri: self.initialUrl(this.pages),
            callback: function (err, response, $) {
                if (err || !$) {
                    self.logger.log("error", err);
                    return cb(err, null);
                } else {
                    self.scrapeUrlPage(response, $, cb, rent)
                }
            },
            headers: nextPageHeaders
        });
    }
    else {
        cb(null, true);
    }
};

LaForet.prototype.initialRentUrl = function(page) {
    var name = encodeURIComponent(this.town.name + " ("+ this.town.code + ")");
    page = page || 1;
    return "http://www.laforet.com/louer/recherche-ajax/" + page + "?localisation=" + name + "&rayon=45"
        + "&price_min=0&price_max=Max&surface_min=0&surface_max=Max&ground_surface=&"
        + "maison=on&appartement=on&terrain=on&floor_min=&floor_max=&photos=1&reference=";
};

LaForet.prototype.initialUrl = function(page) {
    var name = encodeURIComponent(this.town.name + " ("+ this.town.code + ")");
    page = page || 1;
    return "http://www.laforet.com/acheter/recherche-ajax/" + page + "?localisation=" + name + "&rayon=45"
        + "&price_min=0&price_max=Max&surface_min=0&surface_max=Max&ground_surface=&"
        + "maison=on&appartement=on&terrain=on&floor_min=&floor_max=&photos=1&reference=";
};

LaForet.prototype.getURL = function() {
    return "http://www.laforet.com";
};

LaForet.prototype.processListing = function (listingModel, $, url, rental, callback) {
    var self = this,
        agencyTownContainer = $('div.agency-detail ul').prev(),
        fullHTMLContent = $('body').html(),
        latMatch = fullHTMLContent.match(/latitude: (-?\d*(\.\d+)?)/),
        lngMatch = fullHTMLContent.match(/longitude: (-?\d*(\.\d+)?)/),
        jsonData = $('ul.contact-nav li.comparateur').data('json'),
        townName = jsonData.city,
        propertyType = jsonData.propertyType,
        price = jsonData.price,
        agencyTown = agencyTownContainer.text().replace(/\d{5}/,'').trim(); // err - description of the error or null

    listingModel.listing_url = url;

    $('#slideshow-main-1').find('img').each(function (index, img) {
        var listingImage = $(img).attr("src");
        listingModel.images.push(listingImage);
    });

    if ( propertyType == 2 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_APARTMENT;
    } else if ( propertyType == 1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_HOUSE;
    } else if ( propertyType == 4 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_LAND;
    }

    listingModel.price = price;
    listingModel.num_rooms = jsonData.roomsQuantity;
    listingModel.interior_size = jsonData.surface;
    listingModel.description = jsonData.description;

    $(".caracteristiques-detail>ul li").each(function(index,li) {

        var origKey = $(li).find('span.detail-title').text(),
            origVal = $(li).find('span.detail-description').text(),
            key = origKey.toLowerCase(),
            val = origVal.replace(/\s/g,'');

        if (key.indexOf("nombre de chambres") > -1 && val.match("[0-9]+")) {
            listingModel.num_bedrooms = Number(val.match("[0-9]+")[0]);
        } else if ((key.indexOf("salle de bain") > -1 || key.indexOf("salle d'eau") > -1) && val.match("[0-9]+")) {
            listingModel.num_bathrooms = listingModel.num_bathrooms+ Number(val.match("[0-9]+")[0]);
        } else if (key.indexOf("année de construction") > -1 && val.match("[0-9]+")) {
            listingModel.year_built = Number(val.match("[0-9]+")[0]);
        } else if ((key.indexOf("terrain") > -1 || key.indexOf("jardin") > -1) && val.match("[0-9]+")) {
            listingModel.land_size = Number(val.match("[0-9]+"));
        } else if (val.trim().length > 1) {
            listingModel.details[origKey.trim()] = origVal.trim();
        }
    });

    listingModel.agency.website = $('div.agency-detail ul a').attr("href");
    listingModel.agency.address_1 = agencyTownContainer.prev().text();
    listingModel.agency.telephone = $('ul.contact-nav li.appeler span.toggle-show').text().replace(/[+|\(|\)|\s]/g,'')
    townName = townName.replace('Aux alentours de','').trim();
    townName = townName.replace(' L ', ' L\'');
    townName = townName.replace(' D ', ' D\'');
    agencyTown = agencyTown.replace(' L ', ' L\'');
    agencyTown = agencyTown.replace(' D ', ' D\'');
    async.parallel([
        function(cb) {
            util.findTownByName(townName, function(err, town) {
                var encodedAddress = encodeURIComponent(listingModel.agency.address_1);

                if (err) {
                    return cb(err);
                }

                if (town == null) {

                    err = 'Town with code ' + townName + ' could not be found';
                    self.logger.log('error', err);
                    return cb(err);

                } else {

                    listingModel.TownId = town.id;
                    //set default latlng incase map regex fails
                    listingModel.latitude = town.latitude;
                    listingModel.longitude = town.longitude;

                    if (latMatch && lngMatch) {
                        listingModel.latitude = Number(latMatch[1]);
                        listingModel.longitude = Number(lngMatch[1]);
                    }
                }

                cb(null, true);
            });
        },
        function(cb) {
            util.findTownByName(agencyTown, function (err, town) {

                if (err) {
                    self.logger.log("error", err);
                    return cb(err);
                }

                if (town == null) {
                    err =  'LaForet agency Town ' + agencyTown + ' could not be found';
                    self.logger.log('error', err);
                    return cb(err);
                } else {
                    listingModel.agency.TownId = town.id;
                    listingModel.agency.name = self.getScraperName() + " " + town.name;
                }

                cb(null, true);
            });
        }
    ],
    function(err, result) {
        callback(err, listingModel);
    });
};

LaForet.prototype.getScraperName = function() {
    return "LaForet"
};

module.exports =  LaForet;