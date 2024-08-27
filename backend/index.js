const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const speech = require('@google-cloud/speech');
const { v4: uuidv4 } = require('uuid');

const { Readable } = require('stream');
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
console.log("google api : ", GOOGLE_API_KEY);

// Creates a client
const client = new speech.SpeechClient();

// Create a storage client
const storage = new Storage({
    projectId: 'converzai-433805',
    keyFilename: './converzai-433805-2c6a31048170.json',
});

const bucketName = 'converzai';

// audio to transcription
async function quickstart(fileName) {
    // The path to the remote LINEAR16 file
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

    // Detects speech in the audio file
    const [response] = await client.recognize(request);
    const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

    console.log(`Transcription: ${transcription}`);
}

//function to upload
async function uploadWavFile(filePath, destination) {
    try {
        await storage.bucket(bucketName).upload(filePath, {
            destination: destination,
            // public: true,
        });

        console.log(`${filePath} uploaded to ${bucketName}/${destination}`);
    } catch (error) {
        console.error('Error uploading file:', error);
    }
}

// Text-to-Speech Route
app.post("/api/text-to-speech", async (req, res) => {
    const { text } = req.body;
    console.log("text ", text);

    try {
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
    const { audioContent } = req.body;
    const base64Audio = audioContent;

    if (!base64Audio) {
        return res.status(400).json({ error: 'No audio data provided' });
    }

    try {
        // Decode base64 string
        const audioBuffer = Buffer.from(base64Audio, 'base64');

        // Write buffer to a temporary file
        const inputFilePath = path.join(__dirname, 'temp_audio.webm');
        fs.writeFileSync(inputFilePath, audioBuffer);

        const cloudFileName = uuidv4() + '.wav';
        // Output file path
        const outputFilePath = path.join(__dirname, cloudFileName);

        // Convert to wav using ffmpeg
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

        console.log("FFmpeg conversion completed. Starting file upload...");

        await uploadWavFile(outputFilePath, cloudFileName);
        await quickstart(cloudFileName);

        res.status(200);
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'Error processing request' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));