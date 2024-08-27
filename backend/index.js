const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');

require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const client = new speech.SpeechClient();

const storage = new Storage({
    projectId: 'converzai-433805',
    keyFilename: './converzai-433805-2c6a31048170.json',
});

const bucketName = 'converzai';

async function quickstart(fileName) {

    const gcsUri = `gs://converzai/${fileName}`;
    const audio = {
        uri: gcsUri,
    };

    const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
    };

    const request = {
        audio: audio,
        config: config,
    };

    const [response] = await client.recognize(request); // Detects speech in the audio file
    const transcription = response.results
                                  .map(result => result.alternatives[0].transcript)
                                  .join('\n');

    return transcription;

}

//function to upload
async function uploadWavFile(filePath, destination) {
    try {

        await storage.bucket(bucketName).upload(filePath, {
            destination: destination,
        });

    } catch (error) {
        console.error('Error uploading file:', error);
    }
}

// Text-to-Speech Route
app.post("/api/text-to-speech", async (req, res) => {

    try {

        const { text } = req.body;
        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`,
            {
                input: { text: text },
                voice: { languageCode: "en-US", name: "en-US-Wavenet-D" },
                audioConfig: { audioEncoding: "MP3" },
            }
        );

        res.json({ audioContent: response.data.audioContent });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Speech-to-Text Route
app.post('/api/speech-to-text', async (req, res) => {

    try {

        const { audioContent } = req.body;
        const base64Audio = audioContent;

        if (!base64Audio) {
            return res.status(400).json({ error: 'No audio data provided' });
        }

        const audioBuffer = Buffer.from(base64Audio, 'base64');
        const inputFilePath = path.join(__dirname, 'temp_audio.webm');
        fs.writeFileSync(inputFilePath, audioBuffer);

        const fileName = 'audio.wav';
        const outputFilePath = path.join(__dirname, fileName);

        await new Promise((resolve, reject) => {

            ffmpeg(inputFilePath)
                .audioCodec('pcm_s16le')
                .audioFrequency(16000)
                .toFormat('wav')
                .on('start', (commandLine) => {
                    console.log('FFmpeg process started:', commandLine);
                })
                .on('progress', (progress) => {
                    console.log('FFmpeg progress:', progress.percent, '% done');
                })
                .on('end', () => {
                    console.log('FFmpeg conversion finished.');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                })
                .save(outputFilePath);
        });

        await uploadWavFile(outputFilePath, fileName);
        const transcription = await quickstart(fileName);

        res.status(200).json({ transcript: transcription });

    } catch (error) {
        res.status(500).json({ error: 'Error processing request' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));