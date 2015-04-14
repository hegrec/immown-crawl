var api = require('immodispo-api-client'),
    Base = require("./base"),
    async = require('async'),
    _ = require('lodash'),
    util = require('./../util'),
    constants = require('./../constants');

function GuyHoquet(logger, tracker, redis) {
    Base.call(this, logger, tracker, redis);
    this.pages = 1;
}

GuyHoquet.prototype = Object.create(Base.prototype);

GuyHoquet.prototype.scrapeUrlPage = function (result, $, cb, rent) {
    var self = this,
        nextPage = $('a.suiv.dd').attr('href');

    $("section#grid article.item").each(function(index,div){
        var listingURL = $(div).find("a.partager").attr("data-url"),
            photos = $(div).find("a.img div.swiper-slide").length;

        if (photos >= constants.MINIMUM_IMAGES) {
            self.listingUrls.push(listingURL);
        }
    });

    if (nextPage && ++this.pages < 100) {
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

GuyHoquet.prototype.getURL = function() {
    return "http://www.guy-hoquet.com";
};

GuyHoquet.prototype.processListing = function (listingModel, $, url, rental, callback) {
    var self = this,
        constContainer = $('div.rub').contents()[0],
        description = $("div.texte.dg").text().trim(),
        otherDetails = [],
        price = $("div.prix .txt").text().trim().replace(/\s/g,''),
        fullHTMLContent = $('body').html(),
        latMatch = fullHTMLContent.match(/"lat":(-?\d*(\.\d+)?)/),
        lngMatch = fullHTMLContent.match(/"lng":(-?\d*(\.\d+)?)/),
        agencyWebsite = $('#hlSiteAgence').attr('href'),
        townCode = $('div.prix h1 span.detail').text().trim().match(/\d{5}/)[0],
        agencyTownCode = $('#lbVilleAgence').text().match(/\d{5}/)[0];



    price = price.match("[0-9]+")[0];
    listingModel.listing_url = url;
    listingModel.price = price;
    listingModel.description = description;

    $('#photo').find('ul>li>img').each(function(index,img) {

        var listingImage = $(img).attr("src");
        listingModel.images.push(listingImage);
    });

    constContainer = $(constContainer).text().toLowerCase();

    if ( constContainer.indexOf('villa') > -1 || constContainer.indexOf('maison') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_HOUSE;
    } else if ( constContainer.indexOf('appartement') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_APARTMENT;
    } else if ( constContainer.indexOf('terrain') > -1 ) {
        listingModel.construction_type = constants.CONSTRUCTION_TYPE_LAND;
    }

    $("div.detail tr").each(function(ndx, tr) {
        var base = $(tr).text().trim();

        base = base.split(':');
        otherDetails.push({
            key: base[0].trim(),
            value: base[1].trim()
        })
    });

    _.each(otherDetails, function(detail) {
        var key = detail.key.toLowerCase(),
            val = detail.value,
            valNoSpace = val.replace(/\s/g,'').replace('.', '').replace(/,[0-9]+/, '');

        if (key == "surface habitable" && valNoSpace.match("[0-9]+")) {
            listingModel.interior_size = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("chambre") > -1 && val.match("[0-9]+")) {
            listingModel.num_bedrooms = Number(val.match("[0-9]+")[0]);
        } else if (key.indexOf("de pièces") > -1 && val.match("[0-9]+")) {
            listingModel.num_rooms = Number(val.match("[0-9]+")[0]);
        } else if (key.indexOf("de bain") > -1 && val.match("[0-9]+")) {
            listingModel.num_bathrooms = Number(val.match("[0-9]+")[0]);
        } else if (key == "année" && valNoSpace.match("[0-9]+")) {
            listingModel.year_built = valNoSpace.match("[0-9]+")[0];
        } else if ((key == "surface terrain") && valNoSpace.match("[0-9]+")) {
            listingModel.land_size = valNoSpace.match("[0-9]+")[0];
        } else {
            listingModel.details[detail.key] = val;
        }
    });

    if (agencyWebsite.indexOf("http://") == -1) {
        agencyWebsite = self.getURL() + agencyWebsite;
    }

    listingModel.agency.telephone = $('#lbTelAgence').find('b').text().replace(/\s/g,'');
    listingModel.agency.address_1 = $('#lbAdresseAgence').text();
    listingModel.agency.name = $('#lbNomAgence').text();
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

                    if (latMatch && lngMatch) {
                        listingModel.latitude = Number(latMatch[1]);
                        listingModel.longitude = Number(lngMatch[1]);
                    }
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
                    err =  "guyhoquet agency address Town with code" + agencyTownCode + " could not be found";
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
};

GuyHoquet.prototype.initialUrl = function() {
    var searchname = (this.town.name + '-' + this.town.code).replace(/\s/g,'-');
    return 'http://www.guy-hoquet.com/annonces-immobilieres/achat/appartement/maison/terrain/' + searchname + '.aspx?rad=25';
};

GuyHoquet.prototype.initialRentUrl = function() {
    var searchname = (this.town.name + '-' + this.town.code).replace(/\s/g,'-');
    return 'http://www.guy-hoquet.com/annonces-immobilieres/location/appartement/maison/' + searchname + '.aspx?rad=50';
};

GuyHoquet.prototype.getScraperName = function() {
    return "GuyHoquet"
};

module.exports = GuyHoquet;