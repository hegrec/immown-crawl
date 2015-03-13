var api = require('immodispo-api-client'),
    Base = require("./base"),
    async = require('async'),
    _ = require('lodash'),
    util = require('./../util'),
    env = require('./../env');

function GreenAcres(logger, tracker) {
    Base.call(this, logger, tracker);
    this.pages = 1;
}

GreenAcres.prototype = Object.create(Base.prototype);


GreenAcres.prototype.initialUrl = function() {
    var searchname = encodeURIComponent(this.town.name);
    return 'http://www.immofrance.com/fr/prog_show_properties-rf-search-lg-fr-cn-fr-city-'
        + searchname + '.html?p_n=1';
};

GreenAcres.prototype.getScraperName = function() {
    return "GreenAcres"
};

GreenAcres.prototype.scrapeUrlPage = function (result, $, cb) {
    var self = this,
        nextPage = $('#nextPage').attr('href');

    $("div.advertDiv").each(function(index, div) {
        var $div = $(div),
            listingURL = $div.find("a").attr("href"),
            photos = $div.find(".picsNumber").text().trim();

        if (photos>=5) {
            self.listingUrls.push(self.getURL() + listingURL);
        }
    });

    if (nextPage && ++this.pages < 20) {
        self.crawler.queue({
            uri: self.getURL()+nextPage,
            callback: function (err, response, $) {
                if (err) {
                    self.logger.log("error",err)
                    return cb(err, null);
                } else {
                    self.scrapeUrlPage(response, $, cb)
                }
            },
            headers: {
                Cookie: self.cookieString
            }
        });
    } else {
        cb(null, true);
    }
};

GreenAcres.prototype.getURL = function() {
    return "http://www.immofrance.com";
};

GreenAcres.prototype.processListing = function (listingModel, $, url, rental, callback) {
    var self = this,
        otherDetails = [],
        townName = $('#advertBreadCrumb').find('span[itemprop="title"]:last').text(),
        detailsContainer;

    townName = townName.replace(/-/g, ' ');

    $('.fixedTitleBar td').each(function(index, td) {
        var price;

        if ($(td).text().indexOf('€') > -1) {
            price = $(td).text().replace('€', '').replace(',', '');
            price = price.match('[0-9]+')[0];
            listingModel.price = price;
            return true;
        }
    });

    listingModel.listing_url = url;

    $('.titleBox').each(function(index, div) {
        if ($(div).text().indexOf('Descriptif') > -1) {
            listingModel.description = $(div).next().text().trim();
        } else if ($(div).text().indexOf('Principales') > -1) {
            detailsContainer = $(div).next();
        }
    });

    $('#advertThumbsCarousel').find('a>img').each(function(index,img) {
        var listingImage = $(img).attr("src").replace('minipics', 'pics');
        listingModel.images.push(listingImage);
    });

    var descriptionLowerCase = listingModel.description.toLowerCase();

    if ( descriptionLowerCase.indexOf('maison') > -1 ) {
        listingModel.construction_type = 0;
    } else if ( descriptionLowerCase.indexOf('appartement') > -1 ) {
        listingModel.construction_type = 1;
    } else if ( descriptionLowerCase.indexOf('terrain') > -1 || descriptionLowerCase.indexOf('land') > -1 ) {
        listingModel.construction_type = 2;
    }

    if (detailsContainer) {
        detailsContainer.find('li').each(function (index, li) {
            var text = $(li).text();
            otherDetails.push(text);
        });
    }

    _.each(otherDetails, function(text) {
        var key = text.toLowerCase(),
            numberClean = text.replace('/./', '').replace(/,/g, '.');

        if (key == "habitable" && numberClean.match("[0-9]+")) {
            listingModel.interior_size = numberClean.match("[0-9]+")[0];
        } else if (key.indexOf("chambre") > -1 && numberClean.match("[0-9]+")) {
            listingModel.num_bedrooms = Number(numberClean.match("[0-9]+")[0]);
        } else if (key.indexOf("de bain") > -1 && val.match("[0-9]+")) {
            listingModel.num_bathrooms = Number(numberClean.match("[0-9]+")[0]);
        } else if (key.indexOf("pièce") > -1 && numberClean.match("[0-9]+")) {
            listingModel.num_rooms = Number(numberClean.match("[0-9]+")[0]);
        } else if (key.indexOf("year") > -1 && numberClean.match("[0-9]+")) {
            listingModel.year_built = numberClean.match("[0-9]+")[0];
        } else if (key.indexOf("terrain") > -1 && numberClean.match("[0-9]+")) {
            listingModel.land_size = numberClean.match("[0-9]+")[0];
            if (key.indexOf("hectere") > -1) {
                listingModel.land_size = listingModel.land_size * 10000;
            }

        } else {
            listingModel.details[text] = text;
        }
    });

    listingModel.agency.address_1 = '51 rue de l\'Amiral Mouchez';
    listingModel.agency.name = 'Green-Acres';
    listingModel.agency.website = 'http://www.immofrance.com';
    listingModel.agency.TownId = 16150;

    util.findTownByName(townName, function(err, town) {

        if (err) {
            return cb(err);
        }

        if (town == null) {
            err = 'Town with name ' + townName + ' could not be found';
            self.logger.log('error', err);
            return cb(err);

        } else {
            listingModel.TownId = town.id;
            //set default latlng incase map regex fails
            listingModel.latitude = town.latitude;
            listingModel.longitude = town.longitude;
        }

        //return null error and a true status
        callback(err, listingModel);
    });
};

module.exports = GreenAcres;