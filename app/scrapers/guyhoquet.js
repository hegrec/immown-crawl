var Base = require("./base");
var util = require('util');

function GuyHoquet(Models) {
    Base.call(this,Models);
    this.pages = 1;
};
GuyHoquet.prototype = Object.create(Base.prototype);

GuyHoquet.prototype.scrape_urlpage = function (result, $) {
    var self = this;
    var baseURL = result.window.document._URL;
    var listing_count_raw = $("#Principal_ResumeListeAnnonces_LiteralNbResultats").text();
    var num_listings = listing_count_raw.match(/Il y a ([0-9]+)/);
    if (!num_listings || num_listings.length < 2) return false;
    num_listings = num_listings[1]; //2nd match group which will be the number



    var num_pages = Math.floor(num_listings / 10);
    if (num_listings % 10 != 0) {
        num_pages++;
    }
    this.pages = num_pages;
    for (var page=2;page<=num_pages;page++) {

        var closure = function() {
            var p = page;
            self.crawler.queue({
                "uri": baseURL + "&Page=" + p,
                "callback": function (err, response, $) {
                    self.processPageOfListings(err, response, $, p == num_pages)
                },
                "headers": {"Cookie": self.cookie_string}});
        }();
    }

    //process this first page syncronously, delay the future ones, proceed on last
    this.processPageOfListings(null, result, $, num_pages==1)
};

GuyHoquet.prototype.processPageOfListings = function(err,response,$,proceed) {
    var self = this;
    $(".bc.elt ").each(function(index,div){
        var listingURL = $(div).find("h2>a").attr("href");

        var photos = Number($(div).find(".lnkPhotos .mear").text().trim())
        if (photos>=5) {
            self.listing_urls.push(listingURL);
        }
    });

    if (proceed) {
        console.log("guy scraped "+ this.listing_urls.length+"urls for town ", this.town.town_name, this.town.code,"from "+this.pages+" pages");
        this.handleListings(this.listing_urls)
    }
};

GuyHoquet.prototype.getURL = function() {
    return "http://www.guy-hoquet.com";
};

GuyHoquet.prototype.processListing = function (error,result,$,url,rental) {
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

    $("div.pvd.dg a>img").each(function(index,img){
        var listingImage = $(img).attr("src").replace("/65/45/","/705/530/");
        self.listingImages.push(listingImage);
    });

    var price = $("#Principal_DetailAnnonce_lblPrix").text().replace(/s+/g,"");
    price = price.match("[0-9]+");
    this.listing_model.price = price;

    this.listing_model.description = $("#Principal_DetailAnnonce_pnlTxt").text()
    var header_text = $(".ch1").text();
    var vars = header_text.split("-");
    var const_type = vars[1].trim().toLowerCase();
    if ( const_type == "appartement" ) {
        this.listing_model.construction_type = "Apartment";
    } else if ( const_type == "maison" ) {
        this.listing_model.construction_type = "House";
    } else if ( const_type == "terrain" ) {
        this.listing_model.construction_type = "Terrain";
    }

    var size_matcher = /([0-9]+\.?[0-9]+?) m²/;

    if (this.listing_model.construction_type != "Terrain") {
        var rooms = vars[2].match(/([0-9]+) pièce/)
        if (rooms.length>=2) {
            this.listing_model.num_rooms = rooms[1];
        }
        var size = vars[3].replace(",",".").match(size_matcher);
        if (size.length>1) {
            this.listing_model.living_room_surface = size[1];
            this.listing_model.total_surface = size[1];
        }

    } else {
        var land_surface = vars[2].replace(",",".").match(size_matcher);
        if (land_surface.length>1) {
            this.listing_model.total_surface = land_surface[1];
            this.listing_model.land_surface = land_surface[1];
        }
    }

    var match = this.listing_model.description.match(/Réf : ([0-9]+)./);

    this.listing_model.identifier = match[1];
    this.listing_model.feature_score = 0;
    this.listing_model.num_bathrooms = 0;
    this.listing_model.num_parking_space = 0;


    var otherDetails = $(".bc.dd.FT").text().split(">");
    var parsables = [];
    for (var i=0;i<otherDetails.length;i++) {
        if (otherDetails[i].indexOf(":") > -1 ) {
            parsables.push(otherDetails[i].trim());
        }
    }

    for (var i=0;i<parsables.length;i++) {

        var txt = parsables[i].split(":");
        var key = txt[0].toLowerCase().trim();
        var val = txt[1].trim();

        if (key == "nb salles de bain" && val.match("[0-9]+")) {
            this.listing_model.living_room_surface = val.match("[0-9]+")[0];
        } else if (key.indexOf("chambre") > -1 && val.match("[0-9]+")) {
            this.listing_model.num_bedrooms = Number(val.match("[0-9]+")[0]);
        } else if ((key == "nb wc") && val.match("[0-9]+")) {
            this.listing_model.num_bathrooms = this.listing_model.num_bathrooms+Number(val.match("[0-9]+")[0]);
        } else if (key == "annéedeconstruction" && val.match("[0-9]+")) {
            this.listing_model.year_built = val.match("[0-9]+")[0];
        } else if ((key == "surface_terrain") && val.match("[0-9]+")) {
            this.listing_model.land_surface = val.match("[0-9]+");
        }
    }

    var town_match = /(.+?)\s\(\d{5}\)/

    var matches = header_text.match(town_match);
    var town_name = town.town_name;
    if (matches) {
        town_name = matches[1]
    }

    this.agency_model.website = $("#Principal_ContacterAgence_lnkSA").attr("href");
    this.crawler.queue({
        "uri":agency_model.website,
        "callback":function(err,response,$) {


            var agency_details = $(".bch1.bc").text();
            var agency_html = $(".bch1.bc").html();

            var agency_town = agency_html.match("<span itemprop=\"addressLocality\">\\s*(.+)\\s*</span>");
            if (agency_town.length>1)
                agency_town = agency_town[1];
            var agency_phone = agency_html.match("<span itemprop=\"telephone\">\\s*(.+)\\s*</span>");
            if (agency_phone.length>1)
                self.agency_model.phone = agency_phone[1];
            var agency_fax = agency_html.match("<span itemprop=\"faxNumber\">\\s*(.+)\\s*</span>");
            if (agency_fax.length>1)
                self.agency_model.fax = agency_fax[1];
            var agency_address = agency_html.match("<span itemprop=\"streetAddress\">\\s*(.+)\\s*</span>");
            if (agency_address.length>1)
                self.agency_model.street_address = agency_address[1];

            self.agency_model.name = "Guy Hoquet " + agency_town;

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
        },
        "headers":{"Cookie":self.cookie_string}});
 }


GuyHoquet.prototype.initial_url = function() {
    var searchname = (this.town.town_name+"-"+ this.town.code).replace(" ","-");
    return "http://www.guy-hoquet.com/Annonces/Immobilier/pays-de-la-loire/loire-atlantique/vente-neuf_vente_appartement_maison_terrain_" + searchname
        + ".aspx?id=36888726&rad=20&rm=1";
};

GuyHoquet.prototype.getScraperName = function() {
    return "GuyHoquet"
}
module.exports = GuyHoquet;