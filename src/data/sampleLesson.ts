// Sample_Lesson: bundled with the app so a user can complete a full Daily
// Challenge with zero configuration, no API key, and no network access.
// See design.md: "Sample_Lesson (src/data/sampleLesson.ts)".
// Requirements: 2.1, 2.2, 2.4 (structurally valid per validateLesson).
//
// Content is static and hand-authored (Phase 1 has no question-generation
// API). Each Concept's `sourceQuote` is an exact substring of its own `text`,
// so every generated Question can be traced back to real lesson content.

import type { Lesson } from "../domain/types";

export const SAMPLE_LESSON: Lesson = {
  id: "sample-lesson",
  title: "Web Fundamentals: HTTP, the DOM, Git, and Big-O",
  sections: [
    {
      id: "sample-section-http",
      title: "How HTTP Requests Work",
      explanation:
        "HTTP is the protocol browsers and servers use to exchange requests and responses. " +
        "A request has a method, a URL, headers, and an optional body; a response has a " +
        "status code, headers, and a body. Understanding the common methods and status codes " +
        "is essential for building and debugging web applications.",
      concepts: [
        {
          id: "sample-concept-http-get",
          text: "GET requests retrieve data from a server and should not change server state.",
          explanation:
            "GET is used to fetch a resource. Because it's meant to be safe and idempotent, " +
            "GET requests should never modify data on the server.",
          sourceQuote: "GET requests retrieve data from a server and should not change server state.",
        },
        {
          id: "sample-concept-http-post",
          text: "POST requests submit data to a server, often creating a new resource.",
          explanation:
            "POST sends data in the request body to be processed by the server, commonly to " +
            "create a new record or trigger an action that changes state.",
          sourceQuote: "POST requests submit data to a server, often creating a new resource.",
        },
        {
          id: "sample-concept-http-404",
          text: "A 404 status code means the requested resource was not found.",
          explanation:
            "HTTP status codes in the 400s indicate a client error. 404 specifically means the " +
            "server couldn't find anything matching the requested URL.",
          sourceQuote: "A 404 status code means the requested resource was not found.",
        },
        {
          id: "sample-concept-http-500",
          text: "A 500 status code means the server encountered an unexpected error.",
          explanation:
            "HTTP status codes in the 500s indicate a server error: the request was valid, but " +
            "the server failed while trying to fulfill it.",
          sourceQuote: "A 500 status code means the server encountered an unexpected error.",
        },
      ],
    },
    {
      id: "sample-section-dom",
      title: "The Document Object Model (DOM)",
      explanation:
        "The DOM is a tree-shaped, in-memory representation of an HTML document. Browsers " +
        "build the DOM when they parse a page, and JavaScript can read or modify it to change " +
        "what the user sees, without reloading the page.",
      concepts: [
        {
          id: "sample-concept-dom-tree",
          text: "The DOM represents an HTML document as a tree of nodes.",
          explanation:
            "Every element, attribute, and piece of text in an HTML document becomes a node in " +
            "the DOM tree, with parent-child relationships mirroring the HTML's nesting.",
          sourceQuote: "The DOM represents an HTML document as a tree of nodes.",
        },
        {
          id: "sample-concept-dom-queryselector",
          text: "document.querySelector returns the first element matching a CSS selector.",
          explanation:
            "querySelector lets you find DOM elements using the same selector syntax as CSS, " +
            "returning the first match or null if none is found.",
          sourceQuote: "document.querySelector returns the first element matching a CSS selector.",
        },
        {
          id: "sample-concept-dom-event-bubbling",
          text: "Event bubbling means an event fired on an element also fires on its ancestors.",
          explanation:
            "By default, most DOM events start at the target element and propagate upward " +
            "through each ancestor, which is why a click handler on a parent can catch clicks " +
            "on its children.",
          sourceQuote: "Event bubbling means an event fired on an element also fires on its ancestors.",
        },
      ],
    },
    {
      id: "sample-section-git",
      title: "Version Control with Git",
      explanation:
        "Git tracks changes to files over time using commits, and lets multiple people " +
        "collaborate on the same codebase through branches and merges without overwriting " +
        "each other's work.",
      concepts: [
        {
          id: "sample-concept-git-commit",
          text: "A commit is a saved snapshot of the repository at a point in time.",
          explanation:
            "Each commit records the state of tracked files, along with a message describing " +
            "the change, forming a history you can inspect or revert to later.",
          sourceQuote: "A commit is a saved snapshot of the repository at a point in time.",
        },
        {
          id: "sample-concept-git-branch",
          text: "A branch is an independent line of development that can be merged back later.",
          explanation:
            "Branching lets you work on a feature or fix in isolation from the main codebase, " +
            "then integrate those changes back once they're ready.",
          sourceQuote: "A branch is an independent line of development that can be merged back later.",
        },
        {
          id: "sample-concept-git-merge-conflict",
          text: "A merge conflict happens when Git can't automatically combine changes to the same lines.",
          explanation:
            "If two branches modify the same part of a file differently, Git flags a conflict " +
            "and asks a person to decide how to reconcile the two versions.",
          sourceQuote: "A merge conflict happens when Git can't automatically combine changes to the same lines.",
        },
      ],
    },
    {
      id: "sample-section-bigo",
      title: "Big-O Notation Basics",
      explanation:
        "Big-O notation describes how an algorithm's running time or memory use grows as the " +
        "size of its input grows, which makes it possible to compare algorithms independent of " +
        "any specific machine or dataset.",
      concepts: [
        {
          id: "sample-concept-bigo-on",
          text: "O(n) means the running time grows linearly with the size of the input.",
          explanation:
            "An O(n) algorithm, like scanning every item in a list once, takes roughly twice as " +
            "long if you double the input size.",
          sourceQuote: "O(n) means the running time grows linearly with the size of the input.",
        },
        {
          id: "sample-concept-bigo-o1",
          text: "O(1) means the running time stays constant regardless of input size.",
          explanation:
            "An O(1) operation, like looking up a value by key in a hash map, takes the same " +
            "amount of time whether the input has 10 items or 10 million.",
          sourceQuote: "O(1) means the running time stays constant regardless of input size.",
        },
        {
          id: "sample-concept-bigo-ologn",
          text: "O(log n) algorithms, like binary search, cut the problem size roughly in half each step.",
          explanation:
            "Binary search repeatedly halves the range it needs to check, so the number of " +
            "steps grows very slowly even as the input gets much larger.",
          sourceQuote: "O(log n) algorithms, like binary search, cut the problem size roughly in half each step.",
        },
      ],
    },
  ],
};
