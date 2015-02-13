var api = require('immodispo-api-client'),
    Base = require("./base"),
    util = require('./../util'),
    env = require('./../env');

function LaForet(logger) {
    Base.call(this, logger);
    this.pages = 1;
};

LaForet.prototype = Object.create(Base.prototype);

LaForet.prototype.scrapeUrlPage = function (result, $) {
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
        this.crawler.queue({"uri": "http://www.laforet.com" + nextPage, "headers": {"Cookie": self.cookieString},"callback": function(err,res,$) {self.scrapeUrlPage(res,$)}});
    } else {
        console.log("laf scraped " + this.listingUrls.length + " urls for town ", this.town.name, this.town.code, "from " + this.pages + " pages");
        this.handleListings(this.listingUrls)
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

LaForet.prototype.processListing = function (result, $, url, rental) {
    var self = this,
        agencyTownContainer = $(".form-agence .adresse p").first(),
        fullHTMLContent = $('body').html(),
        latMatch = fullHTMLContent.match(/latitude: (-?\d*(\.\d+)?)/),
        lngMatch = fullHTMLContent.match(/longitude: (-?\d*(\.\d+)?)/),
        townName = $('div.titre-annonce').text().trim().replace(/\(.+?\)/,'').trim();

    this.listingModel.listing_url = url;

    $(".fiche-annonce .carousselImages>ul li").each(function(index,li){
        var listingImage = self.getURL()+$(li).find("img:first-child").attr("bigimage");
        self.listingImages.push(listingImage);
    });

    $("p.caracteristiques").each(function(index,p){
        var txt = $(p).text();

        if (txt.indexOf("€") > -1) {
            txt = txt.replace(/\s/g, '');
            self.listingModel.price = txt.match("[0-9]+")[0];
        } else if (txt.indexOf("pièce") > -1) {
            txt = txt.replace(/\s/g, '');
            self.listingModel.num_rooms = txt.match("[0-9]+")[0];

            if ( txt.toLowerCase().indexOf( "appartement" ) > -1 ) {
                self.listingModel.construction_type = "Apartment";
            } else if ( txt.toLowerCase().indexOf( "maison" )  > -1 || txt.toLowerCase().indexOf( "immeuble" )  > -1 ) {
                self.listingModel.construction_type = "House";

            } else if ( txt.toLowerCase().indexOf( "terrain" )  > -1 ) {
                self.listingModel.construction_type = "Terrain";
            }
        } else if (txt.indexOf("m²") > -1) {
            txt = txt.replace(/\s/g, '');
            self.listingModel.total_size = Number(txt.match("[0-9]+")[0]);
        }
    });

    this.listingModel.description = $(".fiche-annonce p.pictos").next().text().trim();
    this.listingModel.num_bathrooms = 0;

    //set default latlng incase map regex fails
    this.listingModel.latitude = this.town.latitude;
    this.listingModel.longitude = this.town.longitude;

    if (latMatch && lngMatch) {
        this.listingModel.latitude = Number(latMatch[1]);
        this.listingModel.longitude = Number(lngMatch[1]);
    }

    $(".detail-caracteristiques>ul li").each(function(index,li) {

        var txt = $(li).text().replace(/\s/g, '').split(":"),
            orig = $(li).text().split(":"),
            key = txt[0].toLowerCase(),
            val = txt[1];

        if (key == "surfaceséjour" && val.match("[0-9]+")) {
            self.listingModel.interior_size = Number(val.match("[0-9]+")[0]);
        } else if (key == "nombredechambres" && val.match("[0-9]+")) {
            self.listingModel.num_bedrooms = Number(val.match("[0-9]+")[0]);
        } else if ((key == "salledebain" || key == "salled'eau") && val.match("[0-9]+")) {
            self.listingModel.num_bathrooms = self.listingModel.num_bathrooms+ Number(val.match("[0-9]+")[0]);
        } else if (key == "annéedeconstruction" && val.match("[0-9]+")) {
            self.listingModel.year_built = Number(val.match("[0-9]+")[0]);
        } else if ((key == "terrain" || key == "jardin") && val.match("[0-9]+")) {
            self.listingModel.land_size = Number(val.match("[0-9]+"));
        } else {
            self.listingDetails[orig[0].trim()] = orig[1].trim();
        }
    });

    this.agencyModel.website = $(".adresse a.infos2").attr("href");
    this.agencyModel.address_1 = agencyTownContainer.next().text();

    util.findTownByName(townName, function(err, town) {
        var encodedAddress = encodeURIComponent(self.agencyModel.address_1);

        if (err) {
            self.logger.log("error", err);
            setImmediate(function() {
                self.handleListings()
            });
            return;
        }

        if (town == null) {
            console.log("Town "+townName+" could not be found");
            self.handleListings();
        } else {
            self.listingModel.TownId = town.id;

            api.get(env.API_HOST + '/agencies?filter=address_1=' + encodedAddress, function (err, items) {
                var agencyTown = agencyTownContainer.text().split("(")[0].trim(); // err - description of the error or null

                // items - array of inserted items
                if (err) {
                    self.logger.log("error", err);
                    setImmediate(function() {
                        self.handleListings()
                    });
                    return;
                }

                if (items.body.length == 0) {

                    util.findTownByName(agencyTown, function(err, town) {

                        if (err) {
                            self.logger.log("error", err);
                            setImmediate(function() {
                                self.handleListings()
                            });
                            return;
                        }

                        if (town == null) {
                            console.log("Town "+agencyTown+" could not be found");
                            self.handleListings();
                        } else {
                            self.agencyModel.TownId = town.id;
                            self.agencyModel.name = self.getScraperName() + " "+town.name;

                            self.createAgency(self.agencyModel)
                        }
                    });
                } else {
                    self.listingModel.AgencyId = items.body[0].id;
                    self.createListing();
                }
            });
        }
    });
};

LaForet.prototype.getScraperName = function() {
    return "LaForet"
};
module.exports =  LaForet;