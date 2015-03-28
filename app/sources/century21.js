var api = require('immodispo-api-client'),
    Base = require("./base"),
    async = require('async'),
    needle = require('needle'),
    _ = require('lodash'),
    util = require('./../util'),
    constants = require('./../constants');

function Century21(logger, tracker, redis) {
    Base.call(this, logger, tracker, redis);
    this.pages = 1;
    this.redis = redis;
    this.visitedHashKey = 'crawler:visited_listings';
    this.localizedTown = '';
}

Century21.prototype = Object.create(Base.prototype);

Century21.prototype.getNeedleHeaders = function() {
    var headers = {};

    headers['DNT'] = 1;
    headers['Host'] = 'www.century21.fr';
    headers['Connection'] = 'keep-alive';
    headers['Cache-Control'] = 'max-age=0';
    headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
    headers['Accept-Encoding'] = 'gzip, deflate, sdch';
    headers['Accept-Language'] = 'en-CA,en;q=0.8,en-US;q=0.6,fr;q=0.4,fr-FR;q=0.2';
    headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.89 Safari/537.36';

    return headers;
};

Century21.prototype.preScrape = function(cb) {
    var autoCompleteUrl = 'http://www.century21.fr/autocomplete/localite/?q='
        + this.town.name,
        self = this;

    self.crawler.queue({
        uri: self.getURL(),
        callback: function (err, result, $) {
            var options;

            if (err) {
                self.logger.log("error",err);
                return cb(err, null);
            } else {
                options = {
                    headers: self.getNeedleHeaders()
                };

                needle.get(autoCompleteUrl, options, function(err, res) {
                    var data = res.body;

                    if (data.length) {
                        self.localizedTown = data[0].id;
                        cb(null, null);
                    } else{
                        cb("fail", null);
                    }
                });
            }
        },
        headers: {
            Cookie: self.cookieString
        }
    });
};

Century21.prototype.scrapeUrlPage = function (result, $, cb, rent) {
    var self = this;

    var listingUrlPrecheck = [];
    $("li.annonce div.zone-photo-exclu>a").each(function (index, a) {
        var listingURL = $(a).attr('href');
        listingUrlPrecheck.push(self.getURL()+listingURL);
    });


    var tasks = [];
    _.each(listingUrlPrecheck, function(listingURL) {
        var task = function(cb) {
            self.redis.hget(self.visitedHashKey,listingURL, function(err, reply) {
                if (!(err || reply)) {
                    self.listingUrls.push(listingURL);
                }
                cb(err, null);
            })
        };

        tasks.push(task);
    });

    async.parallel(tasks, function(err, result){
        cb(err, true);
    });
};

Century21.prototype.getURL = function() {
    return "http://www.century21.fr";
};

Century21.prototype.processListing = function (listingModel, $, url, rental, callback) {
    var self = this,
        images = $('#listeFormatS').find('li>img'),
        price = $('section.tarif>span.yellow b'),
        options = {
            headers: self.getNeedleHeaders()
        },
        agencyAjax = 'http://www.century21.fr/trouver_agence/agence_ajax/'
        + url.match(/\/detail\/([0-9]+\/)/)[1],
        agencyTelephoneBox = $('#numTelDiv').find('span.telAg').text().replace(/\s/g, ''),
        townCode = $('#filAriane').find('>div:last a').text().trim().match(/\(([0-9]{5})\)/)[1],

        titleContainer = $('.h1_page').text().trim().toLowerCase(),
        otherDetails = [];

    if (images.length < 5) {
        self.redis.hset(self.visitedHashKey, url, '1', function(err, result) {
            return callback(null, null);
        });
        return;
    }
    price = price.text().replace(/\s/g, '');
    price = price.match("[0-9]+")[0];
    listingModel.listing_url = url;
    listingModel.price = price;
    listingModel.description = $('#descTextAnnonce').text().trim();

    images.each(function (index, img) {

        var listingImage = $(img).attr("src");
        listingModel.images.push(listingImage);
    });


    if ( titleContainer.indexOf('villa') > -1 || titleContainer.indexOf('maison') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_HOUSE;
    } else if ( titleContainer.indexOf('appartement') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_APARTMENT;
    } else if ( titleContainer.indexOf('terrain') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_LAND;
    }

    $('#descDetailPiece').find('ul>li').each(function(ndx, li) {
        var base = $(li).text().trim();

        if (base.length>1) {
            otherDetails.push({
                key: base,
                value: 'yes'
            })
        }
    });

    $("#descDetailPiece").remove();

    $("div.box").each(function(ndx, boxDiv) {
        var title = $(boxDiv).find('h3').text().toLowerCase(),
            validTitles = {};

        validTitles['vue globale'] = true;
        validTitles['equipement'] = true;
        validTitles['les plus'] = true;

        if (validTitles[title]) {
            $(boxDiv).find('ul>li').each(function(ndx, li) {
                var base = $(li).text().trim(),
                    value = 'yes';

                base = base.split(':');

                if (base.length > 1) {
                    value = base[1].replace('[Voir en détail]', '').trim();
                }

                if (base[0].trim().length>1) {
                    otherDetails.push({
                        key: base[0].trim(),
                        value: value
                    })
                }
            });
        }
    });

    listingModel.num_bedrooms = 0;
    listingModel.num_bathrooms = 0;

    _.each(otherDetails, function(detail) {
        var key = detail.key.toLowerCase(),
            val = detail.value,
            valNoSpace = val.replace(/\s/g,'');

        if (key == "surface habitable" && valNoSpace.match("[0-9]+")) {
            listingModel.interior_size = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("chambre") > -1) {
            listingModel.num_bedrooms++;
        } else if (key.indexOf("de pièces") > -1 && val.match("[0-9]+")) {
            listingModel.num_rooms = Number(val.match("[0-9]+")[0]);
        } else if (key.indexOf("de bain") > -1) {
            listingModel.num_bathrooms++;
        } else if (key.indexOf("année") > -1 && valNoSpace.match("[0-9]+")) {
            listingModel.year_built = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("surface terrain") > -1 && valNoSpace.match("[0-9]+")) {
            listingModel.land_size = valNoSpace.match("[0-9]+")[0];
        } else {
            listingModel.details[detail.key] = val;
        }
    });


    self.crawler.queue({
        uri: agencyAjax,
        callback: function (err, result, $) {
            var options;

            if (err) {
                self.logger.log("error",err);
                return cb(err, null);
            } else {
                var titleBox = $('div.box.W300.margR30>h4:first').text(),
                    address = $('ul.coordonneesAgence>li:first').text(),
                    agencyTownCode = $('ul.coordonneesAgence>li:last').text(),
                    siteSelector = $('div.arrow>h4>a'),

                    agencyWebsite;

                agencyTownCode = agencyTownCode.match(/([0-9]{5})/)[1];


                if (siteSelector) {
                    agencyWebsite = siteSelector.attr('href');
                }

                listingModel.agency.telephone = agencyTelephoneBox.match(/([0-9]+)/)[1];
                listingModel.agency.address_1 = address;
                listingModel.agency.name = titleBox;
                listingModel.agency.website = agencyWebsite;

                async.parallel([
                    function(cb) {
                        util.findTownByPostcode(townCode, function(err, town) {

                            if (err) {
                                return cb(err);
                            }

                            if (town == null) {

                                err = 'Town with code ' + townCode + ' could not be found';
                                self.logger.log('error', err);
                                return cb(err);

                            } else {

                                listingModel.TownId = town.id;
                                //set default latlng incase map regex fails
                                listingModel.latitude = town.latitude;
                                listingModel.longitude = town.longitude;
                            }

                            //return null error and a true status
                            cb(null, true);
                        });
                    },
                    function(cb) {
                        util.findTownByPostcode(agencyTownCode, function (err, town) {

                            if (err) {
                                self.logger.log("error", err);
                                return cb(err);
                            }

                            if (town == null) {
                                err =  "Century21 agency address Town with code" + agencyTownCode + " could not be found";
                                self.logger.log('error', err);
                                return cb(err);
                            } else {
                                listingModel.agency.TownId = town.id;
                            }

                            cb(null, true);
                        });

                    }
                ], function(err, result) {
                    callback(err, listingModel);
                });


            }
        },
        headers: {
            Cookie: self.cookieString
        }
    });
};

    Century21.prototype.initialUrl = function() {
        return 'http://www.century21.fr/annonces/achat-maison-appartement-terrain/'
            + this.localizedTown
            + '/s-0-/st-0-/b-0-/page-1-1000/';
};

Century21.prototype.initialRentUrl = function() {
    return 'http://www.century21.fr/annonces/location-maison-appartement/'
        + this.localizedTown
        + '/alentours-15/s-0-/st-0-/b-0-/page-1-1000/';
};

Century21.prototype.getScraperName = function() {
    return "Century21"
};

module.exports = Century21;