function Logger() {

}

Logger.prototype.log = function log(type, message) {
    if (message == null) {
        message = type;
        type = 'info';
    }

    console.log("["+type+"] "+message);
};

module.exports = Logger;
