var Api = require('immodispo-api-client');
var API_HOST = "http://immown.dev:3001";
var latitudeBounds = [43.797863, 49.906576];
var longitudeBounds = [-0.812988, 5.734863];
var index = 0;
var _ = require('lodash');
var construction_types = ['apartment','home','land'];
var fs = require('fs');
var async = require('async');
var path = require('path');
var dummyImages = [];
var encodedImages = [];
var imagesDirectory = path.join(__dirname, 'images');
var api = new Api("web", "web");


//yay for google (and mozilla)
//http://stackoverflow.com/questions/1527803/generating-random-numbers-in-javascript-in-a-specific-range
function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

function generateListings(agencyId) {

    fs.readdir(imagesDirectory, function(err, files) {
        dummyImages = files;

        _.each(dummyImages, function(image) {
            var image = fs.readFileSync(imagesDirectory+'/'+image);
            encodedImages.push(image.toString("base64"));
        });

    });

    generateSingleListing(agencyId);
}

function generateSingleListing(agencyId) {
    var newListing = {
        price: 50000+Math.floor(Math.random()*1000000),
        description: "This is the description of a listing",
        num_rooms: Math.ceil(Math.random()*10),
        num_bathrooms: Math.ceil(Math.random()*10),
        num_bedrooms: Math.ceil(Math.random()*10),
        construction_type: Math.floor(Math.random()*3),
        listing_url: "http://www.fakenonexistentdomain.awesome/listings/"+Math.floor(Math.random()*100000)+"/"+Math.floor(Math.random()*100000),
        latitude: getRandomArbitrary(latitudeBounds[0],latitudeBounds[1]),
        longitude: getRandomArbitrary(longitudeBounds[0],longitudeBounds[1]),
        land_size: Math.random()*10000,
        interior_size: Math.random()*8000,
        total_size: Math.random()*100000,
        year_built: 1800+Math.floor(Math.random()*214),
        is_rental: Math.floor(0.5+Math.random()),
        AgencyId: agencyId,
        TownId: 1+Math.floor(Math.random()*36000)
    };

    console.log("POSTing listing to API");
    api.post(API_HOST + "/listings", newListing, function (err, savedListing) {

        if (err) {
            throw err;
        }

        var numImagesToGive = 1;
        var functionList = [];

        for (var i=0;i<numImagesToGive;i++) {
            var func = function(callback) {
                var imageFileToUse = encodedImages[Math.floor(Math.random()*encodedImages.length)];
                var imageData = {
                    extension: ".jpg",
                    buffer: imageFileToUse
                };
                console.log("sending image", API_HOST + "/listings/" + savedListing.id + "/images");
                api.post(API_HOST + "/listings/" + savedListing.id + "/images", imageData, function (err, savedImage) {

                    if (err) {
                        throw err;
                    }

                    callback(null, savedImage);
                });
            };
            functionList.push(func);
        }

        async.parallel(functionList, function(err, results) {

            setTimeout(function() {
                generateSingleListing(agencyId);
            }, 100);

        });
    });
}

fs.readFile(__dirname + '/agency.jpg', function(err, data) {
    if (err) throw err;

    var newAgency = {
        name: "Awesomesauce Agency",
        address_1: Math.ceil(Math.random() * 10000) + ' Fake Street',
        address_2: 'Unit ' + Math.ceil(Math.random() * 999),
        telephone: '5555555555',
        email: 'agency@fakenonexistentdomain.awesome',
        website: 'fakenonexistentdomain.awesome',
        TownId: 1 + Math.floor(Math.random() * 36000),
        image: {
            extension: '.jpg',
            buffer: data.toString('base64')
        }
    };

    //console.log(newAgency);

    api.post(API_HOST + "/agencies", newAgency, function (err, savedAgency) {

        if (err) {
            throw new Error(err);
        }

        console.log(savedAgency.id);
        generateListings(Number(savedAgency.id));

    });
});
