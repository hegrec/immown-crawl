var api = require('immodispo-api-client'),
    env = require('./env'),
    _ = require('lodash'),
    Logger = require('./logger');

function ImmoCrawl() {
    this.sources = [];
    this.towns = [];
    this.loggerObject = new Logger();
    this.sourceProcessingIndex = {};
}

/**
 * Sources are added to the list here and processed, names match the filename of the module
 */
ImmoCrawl.prototype.run = function run() {
    var self = this;

    //this.sources.push("laforet");
    this.sources.push("guyhoquet");

    //fire off each source on an individual processing queue
    _.each(this.sources, function(source) {
        self.processTown(source);
    });
};

/**
 * Process a town for a given source and move the pointer up to the next town for callback processing.
 * @param source_name
 */
ImmoCrawl.prototype.processTown = function processTown(sourceName) {
    var source = require("./scrapers/" + sourceName),
        self = this;

    source = new source(this.loggerObject);

    //asyncronously recurse down the town queue
    source.scrape(self.consumeTown(sourceName),function() {
        self.processTown(sourceName);
    });
}

/**
 * Consumes the current town for processing with a given source name
 * @param source_name
 * @returns {*}
 */
ImmoCrawl.prototype.consumeTown = function consumeTown(sourceName) {
    var processingIndex,
        town;

    if (!this.sourceProcessingIndex[sourceName]) {
        this.sourceProcessingIndex[sourceName] = 0;
    }

    processingIndex = this.sourceProcessingIndex[sourceName];
    town = Towns[processingIndex];
    console.log("Processing " + town.name + " for " + sourceName);
    //increment the current town pointer to process the next town when the current scrape yields
    this.sourceProcessingIndex[sourceName] = this.sourceProcessingIndex[sourceName] + 1;
    return town;
}

/**
 * Initiates the crawling process for all sources
 */
ImmoCrawl.prototype.start = function start() {
    var self = this;

    console.log("Starting Node.js Crawler");

    //find the 100 most populous towns and order them randomly for processing
    api.get(env.API_HOST + "/towns?sort=-population&limit=100", function(err, biggestTowns) {
        var townQueue = [],
            ndx;

        if (err) {
            logger.log("error", err);
        }

        biggestTowns = biggestTowns.body;

        while (biggestTowns.length>0) {
            ndx = Math.floor(Math.random() * biggestTowns.length);
            townQueue.push(biggestTowns.splice(ndx,1)[0]);
        }
        Towns = townQueue;

        self.run();
    });
}

module.exports = ImmoCrawl;
