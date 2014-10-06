var Base = require("./base");
var util = require('util');

LaForet = function(Models){
    Base.call(this,Models);
    this.pages = 1;
};
LaForet.prototype = Object.create(Base.prototype);

LaForet.prototype.scrape_urlpage = function (result, $) {
    var self = this;
    $(".resultat>ul li ").each(function (index, li) {
        var listingURL = $(li).find("a:first-child").attr("href");

        var photos = Number($(li).find(".nb-photos>p").text().split(" ")[0])
        if (photos >= 5) {
            self.listing_urls.push(listingURL);
        }
    });
    var nextPage = $('div.pagination .next>a').attr("href");
    if (nextPage) {
        this.pages++;
        this.crawler.queue({"uri": "http://www.laforet.com" + nextPage, "headers": {"Cookie": self.cookie_string},"callback": function(err,res,$) {self.scrape_urlpage(res,$)}});
    } else {
        console.log("laf scraped " + this.listing_urls.length + "urls for town ", this.town.town_name, this.town.code, "from " + this.pages + " pages");
        this.handleListings(this.listing_urls)
    }
}

LaForet.prototype.initial_url = function() {

    /*String inputName = town.getName().replace( "-", "+" );
     inputName = App.stripForeignChars( inputName );
     inputName = inputName.replace( " ", "+" );*/
    return "http://www.laforet.com/immobilier/acheter-immobilier/resultats.php?transactionType=1&libre1=" + this.town.town_name
        + "&libre2=&libre3=&libre4=&libre=&large=10&priceMax=Max&priceMin=0&habitmax=Max&habitmin=0&fieldmin=&appartement=on&maison=on&rooms1=1&rooms2=2&rooms3=3&rooms4=4&rooms5=5&bedrooms1=1&bedrooms2=2&bedrooms3=3&bedrooms4=4&bedrooms5=5&floorMin=&floorMax=&id=&nbresult=50";

}

LaForet.prototype.getURL = function() {
    return "http://www.laforet.com";
}


LaForet.prototype.processListing = function (error,result,$,url,rental) {
    if (error) throw error;
    var self = this;

    this.listingImages = [];
    this.listing_model = this.listing_defaults();
    this.listing_model.listing_url = url;
    this.listing_model.town_id = this.town.id;

    this.agency_model = {
        street_address: "",
        website: ""
    }

    $(".fiche-annonce .carousselImages>ul li").each(function(index,li){
        var listingImage = "http://www.laforet.com"+$(li).find("img:first-child").attr("bigimage");
        self.listingImages.push(listingImage);
    });

    $("p.caracteristiques").each(function(index,p){

        if ($(p).text().indexOf("€") > -1) {
            var txt = $(p).text().replace(/\s/g, '')
            self.listing_model.price = txt.match("[0-9]+")[0];
        } else if ($(p).text().indexOf("pièce") > -1) {
            var txt = $(p).text().replace(/\s/g, '')
            self.listing_model.num_rooms = txt.match("[0-9]+")[0];

            if ( txt.toLowerCase().indexOf( "appartement" ) > -1 ) {
                self.listing_model.construction_type = "Apartment";
            } else if ( txt.toLowerCase().indexOf( "maison" )  > -1 || txt.toLowerCase().indexOf( "immeuble" )  > -1 ) {
                self.listing_model.construction_type = "House";

            } else if ( txt.toLowerCase().indexOf( "terrain" )  > -1 ) {
                self.listing_model.construction_type = "Terrain";
            }


        } else if ($(p).text().indexOf("m²") > -1) {
            var txt = $(p).text().replace(/\s/g, '')
            self.listing_model.total_surface = txt.match("[0-9]+")[0];
        }
    });
    this.listing_model.identifier = $(".reference").text().split(":")[1].trim()
    this.listing_model.feature_score = 0;
    this.listing_model.description = $(".fiche-annonce p.pictos").next().text().trim();
    this.listing_model.num_bathrooms = 0;
    this.listing_model.num_parking_space = 0;
    $(".detail-caracteristiques>ul li").each(function(index,li){

        var txt = $(li).text().replace(/\s/g, '').split(":");
        var key = txt[0].toLowerCase();
        var val = txt[1];

        if (key == "surfaceséjour" && val.match("[0-9]+")) {
            self.listing_model.living_room_surface = val.match("[0-9]+")[0];
        } else if (key == "nombredechambres" && val.match("[0-9]+")) {
            self.listing_model.num_bedrooms = val.match("[0-9]+")[0];
        } else if ((key == "salledebain" || key == "salled'eau") && val.match("[0-9]+")) {
            self.listing_model.num_bathrooms = self.listing_model.num_bathrooms+ val.match("[0-9]+")[0];
        } else if (key == "annéedeconstruction" && val.match("[0-9]+")) {
            self.listing_model.year_built = val.match("[0-9]+")[0];
        } else if ((key == "parkingextérieur" || key == "parkingintérieur") && val.match("[0-9]+")) {
            self.listing_model.num_parking_space = listing_model.num_parking_space + val.match("[0-9]+")[0];
        } else if (key == "chargesannuelles(montantmoyendelaquotepartdubudgetprévisionnel)" && val.match("[0-9]+")) {
            self.listing_model.fees = val.match("[0-9]+")[0];
        } else if (key == "balcon" && val.trim() == "oui") {
            self.listing_model.balcony = true;
        } else if (key == "terrasse" && val.trim() == "oui") {
            self.listing_model.terrace = true;
        } else if (key == "chauffage") {
            self.listing_model.heating = val;
        } else if ((key == "terrain" || key == "jardin") && val.match("[0-9]+")) {
            self.listing_model.land_surface = val.match("[0-9]+");
        }
    });


    this.agency_model.website = $(".adresse a.infos2").attr("href");

    var agency_town = $(".form-agence .adresse p").first().text().split("(")[0].trim();
    this.agency_model.street_address = $(".form-agence .adresse p").first().next().text();
    self.Models.Agency.find({"street_address": self.agency_model.street_address}, function (err, items) {
        // err - description of the error or null
        // items - array of inserted items
        if (err) throw err;
        if (items.length == 0) {
            self.createAgency(agency_town)

        } else {
            self.listing_model.agency_id = items[0].id;
            self.createListing();
        }

    });

};

LaForet.prototype.getScraperName = function() {
    return "LaForet"
};
module.exports =  LaForet;