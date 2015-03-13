var _ = require('lodash'),
    ua = require('universal-analytics'),
    Validator = require('./validator'),
    Crawler = require('./crawler'),
    Logger = require('./logger'),
    LaForet = require('./sources/laforet'),
    GuyHoquet = require('./sources/guyhoquet'),
    GreenAcres = require('./sources/greenacres');

function Application() {
    this.logger = new Logger();
    this.tracker = ua('UA-49102903-2', 'crawler', {strictCidFormat: false});
    this.sources = {
        laforet: new LaForet(this.logger, this.tracker),
        guyhoquet: new GuyHoquet(this.logger, this.tracker)
    }; 

    this.crawler = new Crawler(this.sources, this.logger, this.tracker);
    this.validator = new Validator(this.sources, this.logger, this.tracker);
}

/**
 * start the applicatxion
 */
Application.prototype.start = function start() {
    this.validate();
};

/**
 * Run the validator against all current data
 */
Application.prototype.validate = function validate() {
    var self = this;

    this.validator.validate(function(err, status) {
        if (err) {
            self.logger.log('error', 'Validator encountered error\r\n' + err);

        } else {

            self.logger.log('info', 'Validator finished all tasks...');
            self.crawl();
        }
    });
};

Application.prototype.crawl = function crawl() {
    var self = this;

    this.crawler.crawl(function (err, status) {

        if (err) {
            self.logger.log('error', 'Crawler encountered error\r\n' + err);

        } else {

            self.logger.log('info', 'Crawler finished all tasks... Shutting down.');
        }
    });
};

module.exports = Application;
