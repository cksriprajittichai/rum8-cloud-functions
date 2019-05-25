// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

exports.fillPotential = functions.firestore
  .document('users/{userId}')
  .onCreate((snap, context) => {
    const user = snap.data();
    const userRef = snap.ref;
    const usersRef = snap.ref.parent;

    let fillPotentialPromise;
    if (user.roommate_prefer_same_gender_roommate_value) {
      // Query by same gender
      const genderQueryRef = usersRef.where(Db.keys.GENDER, '==', user.gender);
      fillPotentialPromise = genderQueryRef.get()
        .then((querySnap) => {
          const updateUserPromises = [];
          const otherUserSnaps = querySnap.docs;
          otherUserSnaps.forEach((otherUserSnap) => {
            const otherUser = otherUserSnap.data();
            const otherUserRef = otherUserSnap.ref;
            if (userRef.id !== otherUserRef.id && filterMatch(user, otherUser)) {
              updateUserPromises.concat(
                mutuallyAddToPotential(user, userRef, otherUser, otherUserRef)
              );
            }
          });
          return Promise.all(updateUserPromises);
        });
    } else {
      fillPotentialPromise = usersRef.listDocuments()
        .then((docs) => {
          const getDocPromises = [];
          docs.forEach((doc) => getDocPromises.push(doc.get()));
          return Promise.all(getDocPromises);
        })
        .then((otherUserSnaps) => {
          const updateUserPromises = [];
          otherUserSnaps.forEach((otherUserSnap) => {
            const otherUser = otherUserSnap.data();
            const otherUserRef = otherUserSnap.ref;
            if (userRef.id !== otherUserRef.id && filterMatch(user, otherUser)) {
              updateUserPromises.concat(
                mutuallyAddToPotential(user, userRef, otherUser, otherUserRef)
              );
            }
          });
          return Promise.all(updateUserPromises);
        });
    }

    return fillPotentialPromise
      .then(() => console.log(`Successfully executed fillPotential for user ${userRef.id}`))
      .catch((err) => console.log(err));
  });

/**
 * Adds u1's ID to u2's potential, add u2's ID to u1's potential, and update u1 
 * and u2.
 * 
 * @param {Object} u1
 * @param {FirebaseFirestore.DocumentReference} u1Ref
 * @param {Object} u2
 * @param {FirebaseFirestore.DocumentReference} u2Ref
 * @returns {[Promise<FirebaseFirestore.WriteResult>]}
 */
const mutuallyAddToPotential = (u1, u1Ref, u2, u2Ref) => {
  const updateUserPromises = [];

  // Add u1's ID to u2's potential and update u2
  u2[Db.keys.POTENTIAL][u1Ref.id] = '';
  updateUserPromises.push(
    u2Ref.update({[Db.keys.POTENTIAL]: u2[Db.keys.POTENTIAL]})
  );

  // Add u2's ID to u1's potential and update u1
  u1[Db.keys.POTENTIAL][u2Ref.id] = '';
  updateUserPromises.push(
    u1Ref.update({[Db.keys.POTENTIAL]: u1[Db.keys.POTENTIAL]})
  );

  return updateUserPromises;
};

const Db = {
  keys: {
    ACADEMIC_YEAR: 'academic_year',
    AGE: 'age',
    BUDGET: 'budget',
    COLLEGE: 'college',
    EMAIL: 'email',
    FIRST_NAME: 'first_name',
    GENDER: 'gender',
    LAST_NAME: 'last_name',
    MAJOR: 'major',
    PHONE_NUMBER: 'phone_number',

    ABOUT_ME: 'about_me',
    HOBBIES: 'hobbies',
    INTERESTS: 'interests',
    LIVING_ACCOMMODATIONS: 'living_accommodations',
    OTHER_THINGS_YOU_SHOULD_KNOW: 'other_things_you_should_know',

    POTENTIAL: 'potential',
    LIKED: 'liked',
    DISLIKED: 'disliked',
    MATCHED: 'matched',

    ALCOHOL_VALUE: 'alcohol_value',
    ALLOW_PETS_VALUE: 'allow_pets_value',
    CLEAN_VALUE: 'clean_value',
    OVERNIGHT_GUESTS_VALUE: 'overnight_guests_value',
    PARTY_VALUE: 'party_value',
    RESERVED_VALUE: 'reserved_value',
    SMOKE_VALUE: 'smoke_value',
    STAY_UP_LATE_ON_WEEKDAYS_VALUE: 'stay_up_late_on_weekdays_value',

    ROOMMATE_ALCOHOL_VALUE: 'roommate_alcohol_value',
    ROOMMATE_ALLOW_PETS_VALUE: 'roommate_allow_pets_value',
    ROOMMATE_CLEAN_VALUE: 'roommate_clean_value',
    ROOMMATE_OVERNIGHT_GUESTS_VALUE: 'roommate_overnight_guests_value',
    ROOMMATE_PARTY_VALUE: 'roommate_party_value',
    ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE: 'roommate_prefer_same_gender_roommate_value',
    ROOMMATE_RESERVED_VALUE: 'roommate_reserved_value',
    ROOMMATE_SMOKE_VALUE: 'roommate_smoke_value',
    ROOMMATE_STAY_UP_LATE_ON_WEEKDAYS_VALUE: 'roommate_stay_up_late_on_weekdays_value'
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
};

const genderPasses = (u1, u2) => {
  u1Gender = u1[Db.keys.GENDER];
  u2Gender = u2[Db.keys.GENDER];

  u1GenderPref = u1[Db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];
  u2GenderPref = u2[Db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];

  return u1Gender === u2Gender || (u1GenderPref === 0 && u2GenderPref === 0);
};

const alcoholValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.ALCOHOL_VALUE);

const allowPetsValue = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.ALLOW_PETS_VALUE);

const cleanValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.CLEAN_VALUE);

const overnightGuestsValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.OVERNIGHT_GUESTS_VALUE);

const partyValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.PARTY_VALUE);

const reservedValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.RESERVED_VALUE);

const smokeValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.SMOKE_VALUE);

const stayUpLateOnWeekdaysValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, Db.keys.STAY_UP_LATE_ON_WEEKDAYS_VALUE);

const differenceLessThanTwo = (u1, u2, personalKey) => {
  roommateKey = `roommate_${personalKey}`;

  const u1RoommateValue = u1[personalKey];
  const u2PersonalValue = u2[roommateKey];

  const u1PersonalValue = u1[roommateKey];
  const u2RoommateValue = u2[personalKey];

  return Math.abs(u1RoommateValue - u2PersonalValue) < 2 && Math.abs(u1PersonalValue - u2RoommateValue) < 2;
};
