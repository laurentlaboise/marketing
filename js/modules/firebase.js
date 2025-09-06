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

// Function to handle the form submission
export async function handleFormSubmit(event) {
  event.preventDefault(); // Prevent the form from reloading the page

  const form = event.target;
  const formData = new FormData(form);

  const name = formData.get('name');
  const email = formData.get('email');
  const company = formData.get('company');
  const service = formData.get('service');
  const message = formData.get('message');

  try {
    // This creates a new "submissions" collection if it doesn't exist
    // and adds a new document to it.
    const docRef = await addDoc(collection(db, "submissions"), {
      name: name,
      email: email,
      company: company,
      service: service,
      message: message,
      submittedAt: new Date()
    });

    alert("Thank you for your submission!");
    form.reset(); // Clear the form after submission
  } catch (e) {
    console.error("Error adding document: ", e);
    alert("There was an error submitting your form. Please try again.");
  }
}
