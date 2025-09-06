  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyB3ZGL1BHhZ-uk1-ZsR0-uoQ6qKroa-HLw",
    authDomain: "wordsthatsells-website.firebaseapp.com",
    projectId: "wordsthatsells-website",
    storageBucket: "wordsthatsells-website.firebasestorage.app",
    messagingSenderId: "926017355408",
    appId: "1:926017355408:web:e9740dbc89ad4fa2b5a215",
    measurementId: "G-9EWB7GS931"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
