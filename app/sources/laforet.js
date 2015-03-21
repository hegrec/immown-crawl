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

LaForet.prototype.scrapeUrlPage = function (result, $, cb) {

    var self = this,
        nextPage = $('a.suiv.dd').attr("href");

    $(".resultat>ul li ").each(function (index, li) {

        var listingURL = $(li).find("a:first-child").attr("href"),
            photos = Number($(li).find(".nb-photos>p").text().split(" ")[0]);

        if (photos >= 5) {
            self.listingUrls.push(self.getURL() + listingURL);
        }
    });

    if (nextPage) {

        this.pages++;
        this.crawler.queue({
            uri: self.getURL() + nextPage,
            headers: {
                Cookie: self.cookieString
            },
            callback: function(err, response, $) {

                if (err) {
                    self.logger.log("error",err);
                    return cb(err, null);
                } else {
                    self.scrapeUrlPage(response, $, cb)
                }
            }
        });
    } else {
        cb(null, true);
    }
};

LaForet.prototype.initialUrl = function() {

    var name = this.town.name.replace(" ","+") + "+("+this.town.code+")";

    return "http://www.laforet.com/immobilier/acheter-immobilier/resultats.php" +
        "?transactionType=1&libre="+name+
        "&appartement=on&maison=on&" +
        "rooms1=1&rooms2=2&rooms3=3&rooms4=4&rooms5=5&" +
        "bedrooms1=1&bedrooms2=2&bedrooms3=3&bedrooms4=4&bedrooms5=5&" +
        "priceMax=Max&priceMin=0&habitmax=Max&habitmin=0&largeMap=0&nbresult=50";
};

LaForet.prototype.getURL = function() {
    return "http://www.laforet.com";
};

LaForet.prototype.processListing = function (listingModel, $, url, rental, callback) {
    var self = this,
        agencyTownContainer = $(".form-agence .adresse p").first(),
        fullHTMLContent = $('body').html(),
        latMatch = fullHTMLContent.match(/latitude: (-?\d*(\.\d+)?)/),
        lngMatch = fullHTMLContent.match(/longitude: (-?\d*(\.\d+)?)/),
        townName = $('div.titre-annonce').text().trim().replace(/\(.+?\)/,'').trim(),
        agencyTown = agencyTownContainer.text().split("(")[0].trim(); // err - description of the error or null

    listingModel.listing_url = url;

    $(".fiche-annonce .carousselImages>ul li").each(function(index,li){
        var listingImage = self.getURL()+$(li).find("img:first-child").attr("bigimage");
        listingModel.images.push(listingImage);
    });

    $("p.caracteristiques").each(function(index,p){
        var txt = $(p).text();

        if (txt.indexOf("€") > -1) {
            txt = txt.replace(/\s/g, '');
            listingModel.price = txt.match("[0-9]+")[0];
        } else if (txt.indexOf("pièce") > -1) {
            txt = txt.replace(/\s/g, '');
            listingModel.num_rooms = txt.match("[0-9]+")[0];

            if ( txt.toLowerCase().indexOf( "appartement" ) > -1 ) {
                listingModel.construction_type = constants.CONSTRUCTION_TYPE_APARTMENT;
            } else if ( txt.toLowerCase().indexOf( "maison" )  > -1 || txt.toLowerCase().indexOf( "immeuble" )  > -1 ) {
                listingModel.construction_type = constants.CONSTRUCTION_TYPE_HOUSE;
            } else if ( txt.toLowerCase().indexOf( "terrain" )  > -1 ) {
                listingModel.construction_type = constants.CONSTRUCTION_TYPE_LAND;
            }
        } else if (txt.indexOf("m²") > -1) {
            txt = txt.replace(/\s/g, '');
            listingModel.total_size = Number(txt.match("[0-9]+")[0]);
        }
    });

    listingModel.description = $(".fiche-annonce p.pictos").next().text().trim();
    listingModel.num_bathrooms = 0;

    $(".detail-caracteristiques>ul li").each(function(index,li) {

        var txt = $(li).text().replace(/\s/g, '').split(":"),
            orig = $(li).text().split(":"),
            key = txt[0].toLowerCase(),
            val = txt[1];

        if (key == "surfaceséjour" && val.match("[0-9]+")) {
            listingModel.interior_size = Number(val.match("[0-9]+")[0]);
        } else if (key == "nombredechambres" && val.match("[0-9]+")) {
            listingModel.num_bedrooms = Number(val.match("[0-9]+")[0]);
        } else if ((key == "salledebain" || key == "salled'eau") && val.match("[0-9]+")) {
            listingModel.num_bathrooms = listingModel.num_bathrooms+ Number(val.match("[0-9]+")[0]);
        } else if (key == "annéedeconstruction" && val.match("[0-9]+")) {
            listingModel.year_built = Number(val.match("[0-9]+")[0]);
        } else if ((key == "terrain" || key == "jardin") && val.match("[0-9]+")) {
            listingModel.land_size = Number(val.match("[0-9]+"));
        } else if (orig.length > 1) {
            listingModel.details[orig[0].trim()] = orig[1].trim();
        }
    });

    listingModel.agency.website = $(".adresse a.infos2").attr("href");
    listingModel.agency.address_1 = agencyTownContainer.next().text();
    townName = townName.replace('Aux alentours de','').trim();
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