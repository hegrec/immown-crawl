var api = require('../lib/api');
var Sources = [];
var Towns = [];

/**
 * Sources are added to the list here and processed, names match the filename of the module
 */
function process_sources() {


    Sources.push("laforet");
    //Sources.push("guyhoquet");

    for (var i=0;i<Sources.length;i++) {
        var source_name = Sources[i];
        process_town_for_source(source_name);
    }
}

/**
 * Process a town for a given source and move the pointer up to the next town for callback processing.
 * @param source_name
 */
function process_town_for_source(source_name) {

    var source = require("./scrapers/"+source_name);
    source = new source(Models);
    source.scrape(useWorkingTown(source_name),function() { process_town_for_source(source_name) });
}


var working_town_map = {};
/**
 * Consumes the current town for processing with a given source name
 * @param source_name
 * @returns {*}
 */
function useWorkingTown(source_name) {
    if (!working_town_map[source_name]) {
        working_town_map[source_name] = 0;
    }
    var town = Towns[working_town_map[source_name]];
    working_town_map[source_name] = working_town_map[source_name] + 1;
    return town;
}

/**
 * The app is initialized after connecting to the api
 * @param models
 */
function initialize(err, models) {

    var queryParams = {
        sort: "-population",
        limit: 100
    };
    //find the 100 most populous towns and order them randomly for processing
    models.town.find(queryParams, function(err, biggestTowns) {

        if (err) {
            throw new Error(err);
        }

        var townQueue = [];
        while (biggestTowns.length>0) {
            var ndx = Math.floor(Math.random() * biggestTowns.length);
            townQueue.push(biggestTowns.splice(ndx,1)[0]);
        }
        Towns = townQueue;


        process_sources();
    });
    /*Models = models;


    Models.Town.find(100,"population", function (err, data) {

        var townQueue = [];
        while (data.length>0) {
            var ndx = Math.floor(Math.random() * data.length);
            townQueue.push(data.splice(ndx,1)[0]);
        }
        Towns = townQueue;
        process_sources();
    })*/
}



function start() {
    console.log("Starting Node.js Crawler");
    api.connect(initialize);

}

module.exports = {

    start: start

};