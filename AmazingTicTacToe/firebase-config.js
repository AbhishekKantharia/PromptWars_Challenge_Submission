/**
 * firebase-config.js — Firebase SDK Initialisation & Service Helpers
 * ===================================================================
 * Google Services used:
 *   • Firebase Authentication (Anonymous sign-in)
 *   • Firebase Realtime Database (Global leaderboard)
 *   • Firebase Analytics (User engagement events)
 *
 * Project: trim-surfer-450513-n9  (Google Cloud / Firebase)
 *
 * To configure your own Firebase project:
 *   1. Go to https://console.firebase.google.com
 *   2. Create a project linked to GCP project trim-surfer-450513-n9
 *   3. Add a Web app, copy the firebaseConfig object below
 *   4. Enable Anonymous Authentication in Firebase Console
 *   5. Enable Realtime Database (start in test mode, add rules below)
 *
 * Realtime Database security rules:
 * {
 *   "rules": {
 *     "leaderboard": {
 *       ".read": true,
 *       ".write": "auth != null",
 *       "$entry": {
 *         ".validate": "newData.hasChildren(['player','wins','gamesPlayed','timestamp'])"
 *       }
 *     },
 *     "stats": {
 *       ".read": true,
 *       ".write": "auth != null"
 *     }
 *   }
 * }
 */

"use strict";

// ── Firebase SDK v9 (compat mode for CDN usage) ──────────────────────────────
// Loaded via <script> tags in index.html before this module.

/**
 * Firebase app configuration.
 * Replace placeholder values with your real Firebase project config.
 * The app degrades gracefully if Firebase is unavailable.
 */
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyD_PLACEHOLDER_REPLACE_WITH_REAL_KEY",
    authDomain:        "trim-surfer-450513-n9.firebaseapp.com",
    databaseURL:       "https://trim-surfer-450513-n9-default-rtdb.firebaseio.com",
    projectId:         "trim-surfer-450513-n9",
    storageBucket:     "trim-surfer-450513-n9.appspot.com",
    messagingSenderId: "452186588552",
    appId:             "1:452186588552:web:PLACEHOLDER_APP_ID",
    measurementId:     "G-PLACEHOLDER123",
};

// ── Firebase Service Facade ───────────────────────────────────────────────────

const FirebaseService = (() => {
    let _app      = null;
    let _auth     = null;
    let _database = null;
    let _analytics = null;
    let _user     = null;
    let _ready    = false;

    /**
     * Initialise Firebase SDK services.
     * Safe to call multiple times — initialises only once.
     * Degrades gracefully if SDK is not loaded or config is missing.
     *
     * @returns {Promise<boolean>} true if initialised successfully
     */
    async function init() {
        if (_ready) return true;

        // Guard: Firebase SDK must be loaded via CDN <script> tags
        if (typeof firebase === "undefined") {
            console.warn("[Firebase] SDK not loaded — leaderboard will use local fallback.");
            return false;
        }

        try {
            // Initialise app (avoid duplicate-app error on hot-reload)
            if (!firebase.apps.length) {
                _app = firebase.initializeApp(FIREBASE_CONFIG);
            } else {
                _app = firebase.apps[0];
            }

            _auth     = firebase.auth();
            _database = firebase.database();

            // Firebase Analytics (Google Analytics for Firebase)
            if (firebase.analytics && FIREBASE_CONFIG.measurementId) {
                _analytics = firebase.analytics();
                console.info("[Firebase] Analytics active.");
            }

            // Anonymous sign-in — identifies unique players without PII
            await _signInAnonymously();

            _ready = true;
            console.info(`[Firebase] ✅ Connected — uid: ${_user?.uid}`);
            return true;

        } catch (err) {
            console.warn("[Firebase] Initialisation failed:", err.message);
            return false;
        }
    }

    /** Sign in the current browser session anonymously. */
    async function _signInAnonymously() {
        try {
            const credential = await _auth.signInAnonymously();
            _user = credential.user;
        } catch (err) {
            console.warn("[Firebase] Anonymous auth failed:", err.message);
        }
    }

    // ── Leaderboard ───────────────────────────────────────────────────────────

    /**
     * Write a player's win to the global leaderboard.
     * Creates or updates the anonymous user's entry.
     *
     * @param {Object} data - { wins: number, gamesPlayed: number }
     * @returns {Promise<void>}
     */
    async function submitScore({ wins, gamesPlayed }) {
        if (!_ready || !_user) return;

        const ref = _database.ref(`leaderboard/${_user.uid}`);
        await ref.set({
            player:      _user.uid.slice(0, 8),   // short anonymous ID
            wins,
            gamesPlayed,
            winRate:     gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
            timestamp:   firebase.database.ServerValue.TIMESTAMP,
        });

        logAnalyticsEvent("score_submitted", { wins, gamesPlayed });
    }

    /**
     * Fetch the top N leaderboard entries ordered by wins descending.
     *
     * @param {number} limit - max entries to return (default 10)
     * @returns {Promise<Array>} sorted leaderboard entries
     */
    async function getLeaderboard(limit = 10) {
        if (!_ready) return [];

        const snapshot = await _database
            .ref("leaderboard")
            .orderByChild("wins")
            .limitToLast(limit)
            .once("value");

        const entries = [];
        snapshot.forEach(child => entries.push({ id: child.key, ...child.val() }));
        return entries.sort((a, b) => b.wins - a.wins);
    }

    /**
     * Subscribe to real-time leaderboard updates.
     *
     * @param {Function} callback - called with sorted leaderboard array on each update
     * @returns {Function} unsubscribe function
     */
    function subscribeLeaderboard(callback, limit = 10) {
        if (!_ready) return () => {};

        const ref = _database
            .ref("leaderboard")
            .orderByChild("wins")
            .limitToLast(limit);

        const handler = snapshot => {
            const entries = [];
            snapshot.forEach(child => entries.push({ id: child.key, ...child.val() }));
            callback(entries.sort((a, b) => b.wins - a.wins));
        };

        ref.on("value", handler);
        return () => ref.off("value", handler);   // unsubscribe handle
    }

    /**
     * Increment global game-played counter in Firebase.
     * Uses atomic server-side transaction to avoid race conditions.
     */
    async function incrementGlobalStats() {
        if (!_ready) return;
        const ref = _database.ref("stats/gamesPlayed");
        await ref.transaction(current => (current || 0) + 1);
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    /**
     * Log a custom event to Firebase Analytics (Google Analytics for Firebase).
     *
     * @param {string} eventName - event identifier
     * @param {Object} params - additional event parameters
     */
    function logAnalyticsEvent(eventName, params = {}) {
        if (_analytics) {
            _analytics.logEvent(eventName, params);
        }
        // Also forward to GA4 gtag if available
        if (typeof gtag === "function") {
            gtag("event", eventName, params);
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    return {
        init,
        submitScore,
        getLeaderboard,
        subscribeLeaderboard,
        incrementGlobalStats,
        logAnalyticsEvent,
        get isReady()   { return _ready; },
        get currentUid(){ return _user?.uid ?? null; },
    };
})();
