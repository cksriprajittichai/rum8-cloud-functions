// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

exports.updateRelations = functions.firestore
  .document('users/{userId}')
  .onUpdate((change, context) => {
    const userBefore = change.before.data();
    const user = change.after.data();
    const userRef = change.after.ref;
    const usersRef = userRef.parent;

    if (!preferencesChanged(userBefore, user)) {
      console.log(`Successfully executed updateRelations for user ${userRef.id}. No preferences were changed. There is nothing to be done.`);
      return null;
    }

    const genderUnchanged = userBefore[db.keys.GENDER] === user[db.keys.GENDER];
    const prefersSameGenderRoommate = user[db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];
    const prefersSameGenderRoommateUnchanged = userBefore[db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE] === user[db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];

    let updateRelationsPromise;
    if (genderUnchanged && prefersSameGenderRoommate && prefersSameGenderRoommateUnchanged) {
      // Query by same gender iff the user
      //   1) didn't change gender
      //   2) prefers a same gender roommate
      //   3) preferred a same gender roommate before and still prefers a same 
      //      gender roommate after
      const genderQueryRef = usersRef.where(db.keys.GENDER, '==', user.gender);
      updateRelationsPromise = genderQueryRef.get()
        .then((querySnap) => {
          const updateUserPromises = [];
          const otherUserSnaps = querySnap.docs;
          otherUserSnaps.forEach((otherUserSnap) => {
            const otherUser = otherUserSnap.data();
            const otherUserRef = otherUserSnap.ref;
            const otherUserId = otherUserRef.id;
            if (userRef.id !== otherUserId &&
              !user[db.keys.LIKED].hasOwnProperty(otherUserId) &&
              !user[db.keys.DISLIKED].hasOwnProperty(otherUserId) &&
              !user[db.keys.MATCHED].hasOwnProperty(otherUserId)) {
              const potentialMatch = filterMatch(user, otherUser);
              const alreadyInPotential = user[db.keys.POTENTIAL].hasOwnProperty(otherUserId);

              if (alreadyInPotential && !potentialMatch) {
                updateUserPromises.concat(
                  mutuallyRemoveFromPotential(user, userRef, otherUser, otherUserRef)
                );
              } else if (!alreadyInPotential && potentialMatch) {
                updateUserPromises.concat(
                  mutuallyAddToPotential(user, userRef, otherUser, otherUserRef)
                );
              }
            }
          });
          return Promise.all(updateUserPromises);
        });
    } else {
      updateRelationsPromise = usersRef.listDocuments()
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
            const otherUserId = otherUserRef.id;
            if (userRef.id !== otherUserId &&
              !user[db.keys.LIKED].hasOwnProperty(otherUserId) &&
              !user[db.keys.DISLIKED].hasOwnProperty(otherUserId) &&
              !user[db.keys.MATCHED].hasOwnProperty(otherUserId)) {
              const potentialMatch = filterMatch(user, otherUser);
              const alreadyInPotential = user[db.keys.POTENTIAL].hasOwnProperty(otherUserId);

              if (alreadyInPotential && !potentialMatch) {
                updateUserPromises.concat(
                  mutuallyRemoveFromPotential(user, userRef, otherUser, otherUserRef)
                );
              } else if (!alreadyInPotential && potentialMatch) {
                updateUserPromises.concat(
                  mutuallyAddToPotential(user, userRef, otherUser, otherUserRef)
                );
              }
            }
          });
          return Promise.all(updateUserPromises);
        });
    }

    return updateRelationsPromise
      .then(() => console.log(`Successfully executed updateRelations for user ${userRef.id}.`))
      .catch((err) => console.log(err));
  });

exports.fillPotential = functions.firestore
  .document('users/{userId}')
  .onCreate((snap, context) => {
    const user = snap.data();
    const userRef = snap.ref;
    const usersRef = userRef.parent;

    let fillPotentialPromise;
    if (user.roommate_prefer_same_gender_roommate_value) {
      // Query by same gender
      const genderQueryRef = usersRef.where(db.keys.GENDER, '==', user.gender);
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
      .then(() => console.log(`Successfully executed fillPotential for user ${userRef.id}.`))
      .catch((err) => console.log(err));
  });

/**
 * @param {Object} userBefore
 * @param {Object} userAfter
 * @returns {Boolean}
 */
const preferencesChanged = (userBefore, userAfter) => preferences.some((preference) => userBefore[preference] !== userAfter[preference]);

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
  u2[db.keys.POTENTIAL][u1Ref.id] = '';
  updateUserPromises.push(
    u2Ref.update({[db.keys.POTENTIAL]: u2[db.keys.POTENTIAL]})
  );

  // Add u2's ID to u1's potential and update u1
  u1[db.keys.POTENTIAL][u2Ref.id] = '';
  updateUserPromises.push(
    u1Ref.update({[db.keys.POTENTIAL]: u1[db.keys.POTENTIAL]})
  );

  return updateUserPromises;
};

/**
 * Remove u1's ID from u2's potential, remove u2's ID from u1's potential, and 
 * update u1 and u2.
 * 
 * @param {Object} u1
 * @param {FirebaseFirestore.DocumentReference} u1Ref
 * @param {Object} u2
 * @param {FirebaseFirestore.DocumentReference} u2Ref
 * @returns {[Promise<FirebaseFirestore.WriteResult>]}
 */
const mutuallyRemoveFromPotential = (u1, u1Ref, u2, u2Ref) => {
  const updateUserPromises = [];

  // Remove u1's ID from u2's potential and update u2
  delete u2[db.keys.POTENTIAL][u1Ref.id];
  updateUserPromises.push(
    u2Ref.update({[db.keys.POTENTIAL]: u2[db.keys.POTENTIAL]})
  );

  // Remove u2's ID from u1's potential and update u1
  delete u1[db.keys.POTENTIAL][u2Ref.id];
  updateUserPromises.push(
    u1Ref.update({[db.keys.POTENTIAL]: u1[db.keys.POTENTIAL]})
  );

  return updateUserPromises;
};

const db = {
  keys: {
    GENDER: 'gender',

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

const preferences = [
  db.keys.GENDER,

  db.keys.ALCOHOL_VALUE,
  db.keys.ALLOW_PETS_VALUE,
  db.keys.CLEAN_VALUE,
  db.keys.OVERNIGHT_GUESTS_VALUE,
  db.keys.PARTY_VALUE,
  db.keys.RESERVED_VALUE,
  db.keys.SMOKE_VALUE,
  db.keys.STAY_UP_LATE_ON_WEEKDAYS_VALUE,

  db.keys.ROOMMATE_ALCOHOL_VALUE,
  db.keys.ROOMMATE_ALLOW_PETS_VALUE,
  db.keys.ROOMMATE_CLEAN_VALUE,
  db.keys.ROOMMATE_OVERNIGHT_GUESTS_VALUE,
  db.keys.ROOMMATE_PARTY_VALUE,
  db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE,
  db.keys.ROOMMATE_RESERVED_VALUE,
  db.keys.ROOMMATE_SMOKE_VALUE,
  db.keys.ROOMMATE_STAY_UP_LATE_ON_WEEKDAYS_VALUE
];

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
  u1Gender = u1[db.keys.GENDER];
  u2Gender = u2[db.keys.GENDER];

  u1GenderPref = u1[db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];
  u2GenderPref = u2[db.keys.ROOMMATE_PREFER_SAME_GENDER_ROOMMATE_VALUE];

  return u1Gender === u2Gender || (u1GenderPref === 0 && u2GenderPref === 0);
};

const alcoholValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.ALCOHOL_VALUE);

const allowPetsValue = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.ALLOW_PETS_VALUE);

const cleanValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.CLEAN_VALUE);

const overnightGuestsValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.OVERNIGHT_GUESTS_VALUE);

const partyValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.PARTY_VALUE);

const reservedValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.RESERVED_VALUE);

const smokeValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.SMOKE_VALUE);

const stayUpLateOnWeekdaysValuePasses = (u1, u2) => differenceLessThanTwo(u1, u2, db.keys.STAY_UP_LATE_ON_WEEKDAYS_VALUE);

const differenceLessThanTwo = (u1, u2, personalKey) => {
  roommateKey = `roommate_${personalKey}`;

  const u1RoommateValue = u1[personalKey];
  const u2PersonalValue = u2[roommateKey];

  const u1PersonalValue = u1[roommateKey];
  const u2RoommateValue = u2[personalKey];

  return Math.abs(u1RoommateValue - u2PersonalValue) < 2 && Math.abs(u1PersonalValue - u2RoommateValue) < 2;
};
