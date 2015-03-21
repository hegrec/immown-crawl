function Logger() {

}

Logger.prototype.log = function log(type, message) {
    if (message == null) {
        message = type;
        type = 'info';
    }

    if (type == 'error') {
        return console.error(message);
    }

    console.log(message);
};

module.exports = Logger;
