var api = require('immodispo-api-client'),
    Base = require("./base"),
    async = require('async'),
    needle = require('needle'),
    url = require('url'),
    _ = require('lodash'),
    util = require('./../util'),
    constants = require('./../constants');

function CapiFrance(logger, tracker, redis) {
    Base.call(this, logger, tracker, redis);
    this.pages = 1;
    this.searchTownCode = 0;
}

CapiFrance.prototype = Object.create(Base.prototype);

CapiFrance.prototype.getNeedleHeaders = function() {
    var headers = {};

    headers['DNT'] = 1;
    headers['Host'] = 'www.capifrance.fr';
    headers['Referer'] = 'http://www.capifrance.fr/';
    headers['Connection'] = 'keep-alive';
    headers['Cache-Control'] = 'max-age=0';
    headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
    headers['Accept-Encoding'] = 'gzip, deflate, sdch';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    headers['Accept-Language'] = 'en-CA,en;q=0.8,en-US;q=0.6,fr;q=0.4,fr-FR;q=0.2';
    headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.89 Safari/537.36';

    return headers;
};

CapiFrance.prototype.preScrape = function(cb) {
    var term = this.town.name.replace(/\s/g, '+'),
        autoCompleteUrl = 'http://www.capifrance.fr/city/search/1?term=' + term + '&page_limit=25&_=' + Date.now(),
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

                self.setCookies(result.headers['set-cookie']);

                options.headers['Cookie'] = self.cookieString
                    + ' cb-enabled=enabled; nogeolocation=1; _ga=GA1.2.1144749912.1426437309; _gat=1';

                needle.get(autoCompleteUrl, options, function(err, res) {
                    var data;
                    if (!err && res.body && res.body.results.length) {
                        data = res.body;
                        self.searchTownCode = data.results[0].children[0].id;
                        cb(null, null);
                    } else{
                        cb(err, null);
                    }
                });
            }
        },
        headers: {
            Cookie: self.cookieString
        }
    });
};


CapiFrance.prototype.scrapeUrlPage = function (result, $, cb, rent, isAjax) {
    var self = this,
        nextPage = $('li.more-result').length,
        nextPageHeaders = self.getNeedleHeaders(),
        selector;

    nextPageHeaders['Cookie'] = self.cookieString;

    if (isAjax) {
        selector = $('li')
    } else {
        selector = $('#ajaxExactAds').find('li');
    }

    selector.each(function (index, li) {
        var $li = $(li),
            numPics = $li.find('div.details span.pictures').text().match(/[0-9]+/),
            listingURL = $li.find('a').attr('href');

        if (!numPics || numPics[0]<5) {
            return;
        }

        if (listingURL.indexOf('//') == 0) {
            return;
        }

        self.listingUrls.push(self.getURL() + listingURL);
    });



    if (nextPage && ++this.pages < 20) {
        self.crawler.queue({
            uri: self.initialUrl(this.page),
            callback: function (err, response, $) {
                if (err) {
                    self.logger.log("error", err);
                    return cb(err, null);
                } else {
                    self.scrapeUrlPage(response, $, cb, rent, true)
                }
            },
            headers: nextPageHeaders
        });
    }
    else {
        cb(null, true);
    }
};

CapiFrance.prototype.getURL = function() {
    return "http://www.capifrance.fr";
};

CapiFrance.prototype.processListing = function (listingModel, $, currentUrl, rental, callback) {
    var self = this,
        images = $('#slider').find('ul>li>img'),
        hostname = url.parse(currentUrl).hostname,
        price = $('section.annonceHeader > span.price').text().trim(),
        townCode = $('section.annonceHeader > span.location').text().match(/[0-9]{5}/)[0],
        itemDetails = $('div.caracteristics p').text().trim().split('\n'),
        mapItem = $('#gmapAd'),
        titleContainer = $('section.annonceHeader > div.features h1').text().toLowerCase().trim(),
        otherDetails = [];

    price = price.replace(/\s/g, '');
    price = price.match("[0-9]+")[0];
    listingModel.listing_url = currentUrl;
    listingModel.price = price;
    listingModel.description = $('div.adDetails p:first').text().trim();

    images.each(function (index, img) {
        var listingImage = $(img).attr("src");

        listingModel.images.push('http://' + hostname + listingImage);
    });

    if ( titleContainer.indexOf('villa') > -1 || titleContainer.indexOf('maison') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_HOUSE;
    } else if ( titleContainer.indexOf('appartement') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_APARTMENT;
    } else if ( titleContainer.indexOf('terrain') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_LAND;
    } else {
        return callback(null, null);
    }

    _.each(itemDetails, function(item) {
        var base;

        if (item.indexOf(':') !== -1) {
            base = item.trim().split(':');

            if (base.length > 1 && base[1].length > 0) {
                otherDetails.push({
                    key: base[0],
                    value: base[1]
                })
            }
        }
    });

    $('div.othercaracteristics h2').remove();

    _.each($('div.othercaracteristics').text().split(','), function(otherItem) {
        var key = otherItem.trim();

        if (key.length > 0) {
            otherDetails.push({
                key: key,
                value: 'yes'
            })
        }
    });

    _.each(otherDetails, function(detail) {
        var key = detail.key.toLowerCase(),
            val = detail.value,
            valNoSpace = val.replace(/\s/g,'');

        if ((key.indexOf("surface appr") > -1 || key.indexOf("surface  appr") > -1) && valNoSpace.match("[0-9]+")) {
            listingModel.interior_size = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("chambre") > -1 && valNoSpace.match("[0-9]+")) {
            listingModel.num_bedrooms = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("de pièces") > -1 && val.match("[0-9]+")) {
            listingModel.num_rooms = Number(val.match("[0-9]+")[0]);
        } else if (key.indexOf("de bain") > -1) {
            listingModel.num_bathrooms = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("année") > -1 && valNoSpace.match("[0-9]+")) {
            listingModel.year_built = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("surface terrain") > -1 && valNoSpace.match("[0-9]+")) {
            listingModel.land_size = valNoSpace.match("[0-9]+")[0];
        } else {
            listingModel.details[detail.key] = val;
        }
    });

    listingModel.agency.telephone = '0467924677';
    listingModel.agency.address_1 = 'L’Aéroplane - Bât C - ZAC de l’aéroport, 99 impasse Adam Smith';

    listingModel.agency.name = 'CAPIFRANCE';
    listingModel.agency.email = 'contact@capifrance.fr';
    listingModel.agency.website = 'http://www.capifrance.fr/';
    listingModel.agency.TownId = 18457;

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
            listingModel.latitude = town.latitude;
            listingModel.longitude = town.longitude;

            if (mapItem && mapItem.data('lng') && mapItem.data('lat')) {
                listingModel.longitude = mapItem.data('lng');
                listingModel.latitude = mapItem.data('lat');
            }
        }
        //return null error and a true status
        callback(err, listingModel);
    });
};

CapiFrance.prototype.initialUrl = function(page) {
    page = page ? page : '';

    return 'http://www.capifrance.fr/annonces/recherche'
        + page
        + '?capi_sitebundle_adssearch%5BsearchType%5D=1&capi_sitebundle_adssearch%5Blocation%5D='
        + this.searchTownCode + '&capi_sitebundle_adssearch%5Bdistance%5D=10&capi_sitebundle_adssearch%5BsearchPropertyType%5D%5B%5D=1200&capi_sitebundle_adssearch%5BsearchPropertyType%5D%5B%5D=1100&capi_sitebundle_adssearch%5BsearchPropertyType%5D%5B%5D=1300&capi_sitebundle_adssearch%5BsearchBudgetMax%5D=90000000&capi_sitebundle_adssearch%5BsearchLivingSize%5D=0&capi_sitebundle_adssearch%5Bemail%5D=';
};

CapiFrance.prototype.initialRentUrl = function(page) {
    page = page ? page : '';

    return 'http://www.capifrance.fr/annonces/recherche'
        + page
        + '?capi_sitebundle_adssearch%5BsearchType%5D=2&capi_sitebundle_adssearch%5Blocation%5D='
        + this.searchTownCode + '&capi_sitebundle_adssearch%5Bdistance%5D=20&capi_sitebundle_adssearch%5BsearchPropertyType%5D%5B%5D=1200&capi_sitebundle_adssearch%5BsearchPropertyType%5D%5B%5D=1100&capi_sitebundle_adssearch%5BsearchBudgetMax%5D=90000000&capi_sitebundle_adssearch%5BsearchLivingSize%5D=0#ccNewSearch';
};

CapiFrance.prototype.getScraperName = function() {
    return "CapiFrance"
};

module.exports = CapiFrance;