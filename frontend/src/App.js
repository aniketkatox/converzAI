import './App.css';
import React, { useState, useRef } from 'react';
import axios from 'axios';

function App() {
  const [question, setQuestion] = useState('What is your name?');
  const [answer, setAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  //Question text to speech
  const playQuestion = async () => {
    try {
      const response = await axios.post('http://localhost:5000/api/text-to-speech', { text: question });
      const audioSrc = `data:audio/mp3;base64,${response.data.audioContent}`;
      const audio = new Audio(audioSrc);
      audio.play();
    } catch (error) {
      console.error("Error in text-to-speech API:", error);
      alert("Error playing question. Please try again.");
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Audio stream obtained:', stream);

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        console.log('MediaRecorder initialized:', recorder);

        recorder.ondataavailable = event => {
          console.log('Audio chunk available:', event.data, 'Size:', event.data.size);
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstart = () => console.log('Recording started.');
        recorder.onstop = () => {
          console.log('Recording stopped.');
          handleAudioData();
        };
        recorder.onerror = event => console.error('MediaRecorder error:', event.error);

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        audioChunksRef.current = []; // Clear previous audio chunks
        console.log('Recording started.');
      } catch (error) {
        console.error("Error starting recording:", error);
        alert("Error starting recording. Please check your microphone permissions.");
      }
    } else {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioData = async () => {
    if (audioChunksRef.current.length === 0) {
      alert('No audio recorded.');
      return;
    }

    console.log("Processing audio data");
    
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    console.log("AUDIO blob ", audioBlob);
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);

    reader.onloadend = async () => {
      const base64data = reader.result.split(',')[1]; // Get base64 data

      try {
        const response = await axios.post('http://localhost:5000/api/speech-to-text', {
          audioContent: base64data,
        });

        console.log("\n Transcription:", response.data.transcript);

        setAnswer(response.data.transcript);
      } catch (error) {
        console.error("Error in speech-to-text API:", error);
        alert("Error in speech recognition. Please try again.");
      }
    };
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Speech Interaction App</h1>
      </header>
      <main>
        <div className="question-section">
          <h2>Question:</h2>
          <p>{question}</p>
          <button onClick={playQuestion}>Play Question</button>
        </div>

        <div className="recording-section">
          <button onClick={toggleRecording}>
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>

        <div className="answer-section">
          <h2>Your Answer:</h2>
          <textarea value={answer} readOnly />
        </div>
      </main>
    </div>
  );
}

export default App;