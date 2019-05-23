// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

// Take the text parameter passed to this HTTP endpoint and insert it into the
// Realtime Database under the path /messages/:pushId/original
exports.addMessage = functions.https.onRequest(async (req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into the Realtime Database using the Firebase Admin SDK.
  const snapshot = await admin.database().ref('/messages').push({original: original});
  // Redirect with 303 SEE OTHER to the URL of the pushed object in the Firebase console.
  res.redirect(303, snapshot.ref.toString());
});

// Listens for new messages added to /messages/:pushId/original and creates an
// uppercase version of the message to /messages/:pushId/uppercase
exports.makeUppercase = functions.database.ref('/messages/{pushId}/original')
  .onCreate((snapshot, context) => {
    // Grab the current value of what was written to the Realtime Database.
    const original = snapshot.val();
    console.log('Uppercasing', context.params.pushId, original);
    const uppercase = original.toUpperCase();
    // You must return a Promise when performing asynchronous tasks inside a Functions such as
    // writing to the Firebase Realtime Database.
    // Setting an "uppercase" sibling in the Realtime Database returns a Promise.
    return snapshot.ref.parent.child('uppercase').set(uppercase);
  });

exports.setNewUserFirstNameToChase = functions.firestore
  .document('users/{userId}')
  .onCreate((snap, context) => {
    const user = snap.data();
    console.log(user);

    const userRef = snap.ref;
    return userRef.update({[Db.Keys.FIRST_NAME]: 'Chase'});
  });

exports.fillPotential = functions.firestore
  .document('users/{userId}')
  .onCreate((snap, context) => {
    const user = snap.data();
    const userRef = snap.ref;
    const usersRef = snap.ref.parent;

    if (user.roommate_prefer_same_gender_roommate_value) {
      return usersRef.listDocuments()
        .then((docs) => {
          docs.forEach((doc) => {
            doc.get()
              .then((otherUserSnap) => {
                const otherUser = otherUserSnap.data();
                const otherUserRef = otherUserSnap.ref;
                if (userRef.id !== otherUserRef.id && filterMatch(user, otherUser)) {
                  addUsersToPotentialMutually(user, userRef, otherUser, otherUserRef);
                }
              })
              .catch((err) => console.log(err));
          })
        })
        .catch((err) => console.log(err));
    } else {
      // Query by same gender
      const genderQueryRef = usersRef.where(Db.Keys.GENDER, '==', user.gender);
      return genderQueryRef.get()
        .then((querySnap) => {
          const otherUserSnaps = querySnap.docs;
          otherUserSnaps.forEach((otherUserSnap) => {
            const otherUser = otherUserSnap.data();
            const otherUserRef = otherUserSnap.ref;
            if (userRef.id !== otherUserRef.id && filterMatch(user, otherUser)) {
              addUsersToPotentialMutually(user, userRef, otherUser, otherUserRef);
            }
          });
        })
        .catch((error) => console.log(error));
    }
  });

/**
 * Adds u1's ID to u2's potential, add u2's ID to u1's potential, and update u1 
 * and u2.
 * 
 * @param {Object} u1 
 * @param {FirebaseFirestore.DocumentReference} u1Ref 
 * @param {Object} u2
 * @param {FirebaseFirestore.DocumentReference} u2Ref 
 */
const addUsersToPotentialMutually = (u1, u1Ref, u2, u2Ref) => {
  // Add u1's ID to u2's potential and update u2
  u2[Db.Keys.POTENTIAL][u1Ref.id] = '';
  u2Ref.update({[Db.Keys.POTENTIAL]: u2[Db.Keys.POTENTIAL]});

  // Add u2's ID to u1's potential and update u1
  u1[Db.Keys.POTENTIAL][u2Ref.id] = '';
  u1Ref.update({[Db.Keys.POTENTIAL]: u2[Db.Keys.POTENTIAL]});
};

const Db = {
  Keys: {
    ACADEMIC_YEAR: "academic_year",
    AGE: "age",
    BUDGET: "budget",
    COLLEGE: "college",
    EMAIL: "email",
    FIRST_NAME: "first_name",
    GENDER: "gender",
    LAST_NAME: "last_name",
    MAJOR: "major",
    PHONE_NUMBER: "phone_number",

    ABOUT_ME: "about_me",
    HOBBIES: "hobbies",
    INTERESTS: "interests",
    LIVING_ACCOMMODATIONS: "living_accommodations",
    OTHER_THINGS_YOU_SHOULD_KNOW: "other_things_you_should_know",

    POTENTIAL: "potential",
    LIKED: "liked",
    DISLIKED: "disliked",
    MATCHED: "matched",

    ALCOHOL_VALUE: "alcohol_value",
    ALLOW_PETS_VALUE: "allow_pets_value",
    CLEAN_VALUE: "clean_value",
    OVERNIGHT_GUESTS_VALUE: "overnight_guests_value",
    PARTY_VALUE: "party_value",
    RESERVED_VALUE: "reserved_value",
    SMOKE_VALUE: "smoke_value",
    STAY_UP_LATE_ON_WEEKDAYS_VALUE: "stay_up_late_on_weekdays_value",

    ROOMMATE_ALCOHOL_VALUE: `roommate_${ALCOHOL_VALUE}`,
    ROOMMATE_ALLOW_PETS_VALUE: `roommate_${ALLOW_PETS_VALUE}`,
    ROOMMATE_CLEAN_VALUE: `roommate_${CLEAN_VALUE}`,
    ROOMMATE_OVERNIGHT_GUESTS_VALUE: `roommate_${OVERNIGHT_GUESTS_VALUE}`,
    ROOMMATE_PARTY_VALUE: `roommate_${PARTY_VALUE}`,
    ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE: "roommate_prefer_same_gender_roommate_value",
    ROOMMATE_RESERVED_VALUE: `roommate_${RESERVED_VALUE}`,
    ROOMMATE_SMOKE_VALUE: `roommate_${SMOKE_VALUE}`,
    ROOMMATE_STAY_UP_LATE_ON_WEEKDAYS_VALUE: `roommate_${STAY_UP_LATE_ON_WEEKDAYS_VALUE}`
  }
};

/**
 * @param {Object} u1 
 * @param {Object} u2 
 * @returns {Boolean}
 */
const filterMatch = (u1, u2) => {
  return genderPasses(u1, u2)
    && alcoholValuePasses(u1, u2)
    && allowPetsValue(u1, u2)
    && cleanValuePasses(u1, u2)
    && overnightGuestsValuePasses(u1, u2)
    && partyValuePasses(u1, u2)
    && reservedValuePasses(u1, u2)
    && smokeValuePasses(u1, u2)
    && stayUpLateOnWeekdaysValuePasses(u1, u2);
}

const genderPasses = (u1, u2) => {
  u1Gender = u1[Db.Keys.GENDER];
  u2Gender = u2[Db.Keys.GENDER];

  u1GenderPref = u1[Db.Keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];
  u2GenderPref = u2[Db.Keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];

  return u1Gender.equals(u2Gender) || (u1GenderPref === 0 && u2GenderPref === 0);
}

const alcoholValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.ALCOHOL_VALUE);

const allowPetsValue = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.ALLOW_PETS_VALUE);

const cleanValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.CLEAN_VALUE);

const overnightGuestsValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.OVERNIGHT_GUESTS_VALUE);

const partyValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.PARTY_VALUE);

const reservedValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.RESERVED_VALUE);

const smokeValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.SMOKE_VALUE);

const stayUpLateOnWeekdaysValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.Keys.STAY_UP_LATE_ON_WEEKDAYS_VALUE);

const differenceLessThanTwo = (u1, u2, personalKey) => {
  roommateKey = `roommate_${personalKey}`;

  const u1RoommateValue = u1[personalKey];
  const u2PersonalValue = u2[roommateKey];

  const u1PersonalValue = u1[roommateKey];
  const u2RoommateValue = u2[personalKey];

  return Math.abs(u1RoommateValue - u2PersonalValue) < 2 && Math.abs(u1PersonalValue - u2RoommateValue) < 2;
}

