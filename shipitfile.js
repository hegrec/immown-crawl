

module.exports = function (shipit) {
    require('shipit-deploy')(shipit);

    shipit.initConfig({
        default: {
            workspace: '/tmp/immodispo-crawl',
            deployTo: '/opt/immodispo-crawl',
            repositoryUrl: 'https://github.com/hegrec/immodispo-crawl.git',
            ignores: ['.git', 'node_modules'],
            keepReleases: 3
        },
        staging: {
            servers: 'nodeapps@caketoast.com'
        },
        production: {
            servers: 'nodeapps@mealtrap.com'
        }
    });

    shipit.on('published', function() {
        shipit.remote('cd /opt/immodispo-crawl/current && npm install').then(function(res) {
            shipit.log(res);
            shipit.remote('cp /home/nodeapps/crawl-env.js /opt/immodispo-crawl/current/app/env.js').then(function(res) {
                shipit.log(res);
                shipit.remote('pm2 restart crawl').then(function(res) {
                    shipit.log(res);
                });
            });
        });
    })
};