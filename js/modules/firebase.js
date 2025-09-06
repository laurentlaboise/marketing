// js/modules/firebase.js

// These imports are essential for connecting to the database
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
// Make sure this is the configuration you got from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyB3ZGL1BHhZ-uk1-ZsR0-uoQ6qKroa-HLw",
  authDomain: "wordsthatsells-website.firebaseapp.com",
  projectId: "wordsthatsells-website",
  storageBucket: "wordsthatsells-website.firebasestorage.app",
  messagingSenderId: "926017355408",
  appId: "1:926017355408:web:e9740dbc89ad4fa2b5a215"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize the Firestore database service
const db = getFirestore(app);


// Function to handle the form submission
export async function handleFormSubmit(event) {
  event.preventDefault(); 

  const form = event.target;
  const formData = new FormData(form);

  const name = formData.get('name');
  const email = formData.get('email');
  const company = formData.get('company');
  const service = formData.get('service');
  const message = formData.get('message');

  try {
    const docRef = await addDoc(collection(db, "submissions"), {
      name: name,
      email: email,
      company: company,
      service: service,
      message: message,
      submittedAt: new Date()
    });

    alert("Thank you for your submission!");
    form.reset();
  } catch (e) {
    console.error("Error adding document: ", e);
    alert("There was an error submitting your form. Please try again.");
  }
}
