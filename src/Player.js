const ytdl = require('ytdl-core');
const SYA = require('simple-youtube-api');
const mergeOptions = require('merge-options');

const Queue = require('./Queue');
const Util = require('./Util');
const Song = require('./Song');

/**
 * Player options.
 * @typedef {PlayerOptions}
 * 
 * @property {Boolean} leaveOnEnd Whether the bot should leave the current voice channel when the queue ends.
 * @property {Boolean} leaveOnStop Whether the bot should leave the current voice channel when the stop() function is used.
 */ 
const PlayerOptions = {
    leaveOnEnd: true,
    leaveOnStop: true
};

class Player {

    /**
     * @param {Client} client Your Discord Client instance.
     * @param {string} youtubeToken Your Youtube Data v3 API key.
     * @param {PlayerOptions} options The PlayerOptions object.
     */
    constructor(client, youtubeToken, options = {}){
        if(!client) throw new SyntaxError('Invalid Discord client');
        if(!youtubeToken) throw new SyntaxError('Invalid Token: Token must be a String');
        /**
         * Your Discord Client instance.
         * @type {Client}
         */
        this.client = client;
        /**
         * Your Youtube Data v3 API key.
         * @type {string}
         */
        this.youtubeToken = youtubeToken;
        /**
         * The Simple Youtube API Client.
         * @type {Youtube}
         */
        this.SYA = new SYA(this.youtubeToken);
        /**
         * The guilds data.
         * @type {Queue[]}
         */
        this.queues = [];
        /**
         * Player options.
         * @type {PlayerOptions}
         */
        this.options = mergeOptions(PlayerOptions, options);
    }

    /**
     * Whether a guild is currently playing songs
     * @param {string} guildID The guild ID to check
     * @returns {Boolean} Whether the guild is currently playing songs
     */
    isPlaying(guildID) {
        return this.queues.some((g) => g.guildID === guildID);
    }

    /**
     * Plays a song in a voice channel.
     * @param {voiceChannel} voiceChannel The voice channel in which the song will be played.
     * @param {string} songName The name of the song to play.
     * @returns {Promise<Song>}
     */
    play(voiceChannel, songName) {
        this.queues = this.queues.filter((g) => g.guildID !== voiceChannel.id);
        return new Promise(async (resolve, reject) => {
            // Searches the song
            let video = await Util.getFirstYoutubeResult(songName, this.SYA).catch(() => {});
            if(!video) reject('Song not found');
            // Joins the voice channel
            let connection = await voiceChannel.join();
            // Creates a new guild with data
            let queue = new Queue(voiceChannel.guild.id);
            queue.connection = connection;
            let song = new Song(video, queue);
            queue.songs.push(song);
            // Add the queue to the list
            this.queues.push(queue);
            // Plays the song
            this._playSong(queue.guildID, true);
            // Resolves the song.
            resolve(song);
        });
    }

    /**
     * Pauses the current song.
     * @param {string} guildID
     * @returns {Promise<Song>}
     */
    pause(guildID){
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Pauses the dispatcher
            queue.dispatcher.pause();
            queue.playing = false;
            // Resolves the guild queue
            resolve(queue.songs[0]);
        });
    }

    /**
     * Resumes the current song.
     * @param {string} guildID
     * @returns {Promise<Song>}
     */
    resume(guildID){
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Pauses the dispatcher
            queue.dispatcher.resume();
            queue.playing = true;
            // Resolves the guild queue
            resolve(queue.songs[0]);
        });
    }

    /**
     * Stops playing music.
     * @param {string} guildID
     * @returns {Promise<void>}
     */
    stop(guildID){
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Stops the dispatcher
            queue.stopped = true;
            queue.songs = [];
            queue.dispatcher.end();
            // Resolves
            resolve();
        });
    }

    /**
     * Updates the volume.
     * @param {string} guildID 
     * @param {number} percent 
     * @returns {Promise<void>}
     */
    setVolume(guildID, percent) {
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Updates volume
            queue.dispatcher.setVolumeLogarithmic(percent / 200);
            // Resolves guild queue
            resolve(queue);
        });
    }

    /**
     * Gets the guild queue.
     * @param {string} guildID
     * @returns {Promise<Queue>}
     */
    getQueue(guildID) {
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Resolves the guild queue
            resolve(queue);
        });
    }

    /**
     * Adds a song to the guild queue.
     * @param {string} guildID
     * @param {string} songName The name of the song to add to the queue.
     * @returns {Promise<Song>}
     */
    addToQueue(guildID, songName){
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Searches the song
            let video = await Util.getFirstYoutubeResult(songName, this.SYA).catch(() => {});
            if(!video) reject('Song not found');
            let song = new Song(video, queue);
            // Updates queue
            queue.songs.push(song);
            // Resolves the song
            resolve(song);
        });
    }

    /**
     * Clears the guild queue, but not the current song.
     * @param {string} guildID
     * @returns {Promise<Queue>}
     */
    clearQueue(guildID){
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Clears queue
            let currentlyPlaying = queue.songs.shift();
            queue.songs = [ currentlyPlaying ];
            // Resolves guild queue
            resolve(queue);
        });
    }

    /**
     * Skips a song.
     * @param {string} guildID
     * @returns {Promise<Queue>}
     */
    skip(guildID){
        return new Promise(async(resolve, reject) => {
            // Gets guild queue
            let queue = this.queues.find((g) => g.guildID === guildID);
            if(!queue) reject('Not playing');
            // Ends the dispatcher
            queue.dispatcher.end();
            queue.skipped = true;
            // Resolves guild queue
            resolve(queue);
        });
    }

    /**
     * Start playing songs in a guild.
     * @ignore
     * @param {string} guildID
     * @param {Boolean} firstPlay Whether the function was called from the play() one
     */
    async _playSong(guildID, firstPlay) {
        // Gets guild queue
        let queue = this.queues.find((g) => g.guildID === guildID);
        // If there isn't any music in the queue
        if(queue.songs.length < 2 && !firstPlay){
            // Leaves the voice channel
            if(this.options.leaveOnEnd) queue.connection.disconnect();
            // Remoces the guild from the guilds list
            this.queues = this.queues.filter((g) => g.guildID !== guildID);
            // Emits stop event
            if(queue.stopped) return queue.emit('stop');
            // Emits end event 
            return queue.emit('end');
        }
        // Emit songChanged event
        if(!firstPlay) queue.emit('songChanged', queue.songs.shift(), queue.songs[0], queue.skipped);
        queue.skipped = false;
        let song = queue.songs[0];
        // Download the song
        let dispatcher = queue.connection.play(ytdl(song.url, { filter: "audioonly" }));
        queue.dispatcher = dispatcher;
        // Set volume
        dispatcher.setVolumeLogarithmic(queue.volume / 200);
        // When the song ends
        dispatcher.on('finish', () => {
            // Play the next song
            return this._playSong(guildID, false);
        });
    }

};

module.exports = Player;