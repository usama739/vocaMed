import { describe, expect, it } from 'vitest';
import {
    insertAtCursor,
    renderTemplate,
    smsLength,
    unknownVariables,
} from './message';

const KNOWN = ['patient_name', 'doctor', 'time', 'clinic_name', 'link'];

describe('renderTemplate', () => {
    it('fills known variables and leaves unknown ones as written', () => {
        expect(
            renderTemplate('Hi {patient_name}, see {doctor}. {oops}', {
                patient_name: 'Ayesha',
                doctor: 'Dr. Rahman',
            }),
        ).toBe('Hi Ayesha, see Dr. Rahman. {oops}');
    });

    it('fills a variable every time it appears', () => {
        expect(renderTemplate('{time} / {time}', { time: '4pm' })).toBe(
            '4pm / 4pm',
        );
    });
});

describe('unknownVariables', () => {
    it('lists each unknown name once, in order', () => {
        expect(unknownVariables('{doctor} {foo} {bar} {foo}', KNOWN)).toEqual([
            'foo',
            'bar',
        ]);
    });

    it('finds nothing when every variable is known', () => {
        expect(unknownVariables('Hi {patient_name} {link}', KNOWN)).toEqual([]);
    });

    it('treats an empty pair of braces as unknown', () => {
        expect(unknownVariables('Hi {}', KNOWN)).toEqual(['']);
    });
});

describe('insertAtCursor', () => {
    it('inserts in the middle and puts the cursor after the token', () => {
        expect(
            insertAtCursor('Hi , bye', '{patient_name}', {
                start: 3,
                end: 3,
            }),
        ).toEqual({ text: 'Hi {patient_name}, bye', caret: 17 });
    });

    it('replaces the selected text', () => {
        expect(
            insertAtCursor('Hi NAME, bye', '{patient_name}', {
                start: 3,
                end: 7,
            }).text,
        ).toBe('Hi {patient_name}, bye');
    });

    it('appends when there is no selection yet', () => {
        expect(insertAtCursor('Hello', '{link}', null)).toEqual({
            text: 'Hello{link}',
            caret: 11,
        });
    });

    it('clamps a selection that is past the end', () => {
        expect(insertAtCursor('Hi', '!', { start: 10, end: 12 }).text).toBe(
            'Hi!',
        );
    });
});

describe('smsLength', () => {
    it('counts plain text as one part up to 160 characters', () => {
        expect(smsLength('a'.repeat(160))).toEqual({
            length: 160,
            parts: 1,
            unicode: false,
        });
    });

    it('splits plain text into parts of 153 after that', () => {
        expect(smsLength('a'.repeat(161)).parts).toBe(2);
        expect(smsLength('a'.repeat(306)).parts).toBe(2);
        expect(smsLength('a'.repeat(307)).parts).toBe(3);
    });

    it('uses the shorter limits for Urdu text', () => {
        expect(smsLength('ا'.repeat(70))).toEqual({
            length: 70,
            parts: 1,
            unicode: true,
        });
        expect(smsLength('ا'.repeat(71)).parts).toBe(2);
        expect(smsLength('ا'.repeat(135)).parts).toBe(3);
    });
});
