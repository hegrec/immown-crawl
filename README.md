<h2>Immodispo Node.js crawler</h2>

This repo contains the immodispo crawler




**installation:**

1. First install the immodispo-vm (<a href="https://github.com/hegrec/immodispo-vm">https://github.com/hegrec/immodispo-vm</a>)


Your folder structure should look like this:
<br><br>
<div>/immodispo/</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;/immodispo-vm/</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Vagrantfile and other files are here</div>



1. Clone this repo (immodispo-crawl) under the /immodispo/ folder
2. On your host machine, navigate to the immodispo-crawl folder and run <i>npm install</i> (This may require sudo)
1. Navigate to your immodispo-vm folder on your host machine
2. <i>vagrant ssh</i> to connect to the VM
3. <i>cd /vagrant/immodispo-crawl<i>
4. <i>node app.js</i>
5. The crawler will immediately start crawling the sites for data to upload to the datastore. 
This data will immediately be available on the website (immodispo-web) if you have it running.