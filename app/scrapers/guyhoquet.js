var api = require('immodispo-api-client'),
    Base = require("./base"),
    util = require('util');

function GuyHoquet(logger) {
    Base.call(this, logger);
    this.pages = 1;
};

GuyHoquet.prototype = Object.create(Base.prototype);

GuyHoquet.prototype.scrapeUrlPage = function (result, $) {
    var self = this,
        baseURL = result.window.document._URL,
        nextPage = $('a.suiv.dd').attr('href');

    $("section#grid article.item").each(function(index,div){
        var listingURL = $(div).find("a.partager").attr("data-url"),
            photos = $(div).find("a.img div.swiper-slide").length;

        if (photos>=5) {
            self.listingUrls.push(listingURL);
        }
    });

    if (nextPage) {
        self.crawler.queue({
            "uri": self.getURL()+nextPage,
            "callback": function (err, response, $) {
                if (err) {
                    self.logger.log("error",err)

                } else {
                    self.scrapeUrlPage(response, $)
                }
            },
            "headers": {"Cookie": self.cookieString}
        });
    } else {
        self.logger.log("guy scraped "+ this.listingUrls.length+"urls for town ", this.town.name, this.town.code,"from "+this.pages+" pages");
        this.handleListings(this.listingUrls)
    }
};

GuyHoquet.prototype.getURL = function() {
    return "http://www.guy-hoquet.com";
};

GuyHoquet.prototype.processListing = function (result, $, url, rental) {
    var self = this,
        constContainer = $('div.rub').contents()[0].lower(),
        description = $("div.texte.dg").text(),
        numberMatcher = /[0-9]+s?[0-9]?/,
        otherDetails = [],
        price = $("div.prix").text().replace(/s+/g,""),
        sizeMatcher = /([0-9]+\.?[0-9]+?) m²/,
        townMatch = /(.+?)\s\(\d{5}\)/,
        headerText = $('blah'),
        matches = headerText.match(townMatch),
        agencyTownPostcode = $('#lbVilleAgence').text().split(" ")[0],
        encodedAddress = encodeURIComponent(self.agencyModel.address_1),

        match;

    price = price.match("[0-9]+");
    this.listingModel.listing_url = url;
    this.listingModel.TownId = this.town.id;
    this.listingModel.price = price;
    this.listingModel.description = description;

    $("#photo ul>li>img").each(function(index,img) {
        var listingImage = $(img).attr("src");
        self.listingImages.push(listingImage);
    });

    if ( constContainer.indexOf('villa') > -1 || constContainer.indexOf('maison') > -1 ) {
        this.listingModel.construction_type = "House";
    } else if ( constContainer.indexOf('appartment') > -1 ) {
        this.listingModel.construction_type = "Apartment";
    } else if ( constContainer.indexOf('terrain') > -1 ) {
        this.listingModel.construction_type = "Terrain";
    }

    this.listingModel.identifier = match[1];
    this.listingModel.feature_score = 0;
    this.listingModel.num_bathrooms = 0;
    this.listingModel.num_parking_space = 0;

    match = this.listingModel.description.match(/Réf : ([0-9]+)./);

    $("div.detail tr").each(function(ndx, tr) {
        var base = $(tr).text().trim();

        base = base.split(':');
        otherDetails.push({
            key: base[0].trim(),
            value: base[1].trim(),
        })
    });

    _.each(otherDetails, function(detail) {
        var key = detail.key.lower(),
            val = detail.val,
            valNoSpace = val.replace(/s+/g,'');

        if (key == "surface habitable" && valNoSpace.match("[0-9]+")) {
            this.listingModel.interior_size = valNoSpace.match("[0-9]+")[0];
        } else if (key.indexOf("chambre") > -1 && val.match("[0-9]+")) {
            this.listingModel.num_bedrooms = Number(val.match("[0-9]+")[0]);
        } else if ((key == "de bain") && val.match("[0-9]+")) {
            this.listingModel.num_bathrooms = Number(val.match("[0-9]+")[0]);
        } else if (key == "année" && valNoSpace.match("[0-9]+")) {
            this.listingModel.year_built = valNoSpace.match("[0-9]+")[0];
        } else if ((key == "surface_terrain") && valNoSpace.match("[0-9]+")) {
            this.listingModel.land_surface = valNoSpace.match("[0-9]+");
        } else {
            this.listingDetails[detail.key] = val;
        }
    });



    self.agencyModel.phone = $('#lbTelAgence b').text().replace(/s+/g,'');
    self.agencyModel.address_1 = $('#lbNomAgence').text();
    self.agencyModel.name = $('#lbNomAgence').text();

    api.get(env.API_HOST + '/agencies?filter=address_1=' + encodedAddress, function (err, items) {
        var agencyTown = agencyTownContainer.text().split("(")[0].trim();// err - description of the error or null
        // items - array of inserted items
        if (err) {
            self.logger.log("error", err);
            setImmediate(function () {
                self.handleListings()
            });
            return;
        }
        if (items.body.length == 0) {

            util.findTownByPostcode(agencyTownPostcode, function (err, town) {

                if (err) {
                    self.logger.log("error", err);
                    setImmediate(function () {
                        self.handleListings()
                    });
                    return;
                }

                if (town == null) {
                    console.log("Town " + agencyTown + " could not be found");
                    self.handleListings();
                } else {
                    self.agencyModel.TownId = town.id;
                    self.createAgency(self.agencyModel)
                }

            });


        } else {
            self.listingModel.AgencyId = items.body[0].id;
            self.createListing();
        }
    });
};

GuyHoquet.prototype.initialUrl = function() {
    var searchname = (this.town.name+"-"+ this.town.code).replace(" ","-");
    return 'http://www.guy-hoquet.com/annonces-immobilieres/achat/appartement/maison/terrain/' + searchname + '.aspx?rad=5';
};

GuyHoquet.prototype.getScraperName = function() {
    return "GuyHoquet"
};
module.exports = GuyHoquet;