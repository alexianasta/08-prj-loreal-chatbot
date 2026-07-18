/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const chatMessages = document.getElementById("chatMessages");
const chatEmptyState = document.getElementById("chatEmptyState");
const sendBtn = document.getElementById("sendBtn");
const chatMemorySummary = document.getElementById("chatMemorySummary");
const chatMemoryList = document.getElementById("chatMemoryList");

// Read the worker URL from local non-secret config.
const workerUrl =
  window.APP_CONFIG?.workerUrl ||
  "https://loreal-chatbot.your-subdomain.workers.dev/";

// System instructions that guide the assistant's behavior.
const shoppingAssistantInstructions = `You are an expert shopping assistant for L'Oreal, dedicated to helping users find the most suitable cosmetics and makeup products tailored to their needs. Begin by asking clarifying questions to understand the user's preferences, specific concerns, intended look or outcome, skin type, desired product category, and budget. Consider user responses, analyze the information provided, and use your expertise to identify the best L'Oreal products that match their requirements. Keep recommendations clear, concise, friendly, and helpful. Persist with follow-up questions if more information is needed to refine your suggestions before making final product recommendations.

Detailed reasoning before recommendations:
- Evaluate all user-input details (needs, preferences, skin type, intended effect, budget, any sensitivities/allergies, previous product likes/dislikes).
- Explain briefly why each recommended product fits the user's criteria.
- If multiple options are suitable, outline distinctions (for example: finish, coverage, suitability for certain skin types) to help users choose.

Response format:
- Responses should be concise, friendly paragraphs (1-3 sentences per product).
- Include product names, quick benefit highlights, and, if possible, a brief rationale for each pick.
- If asking follow-up questions, keep them focused and conversational.

Briefly: Gather user details first, explain your choices, and provide friendly, clear recommendations last. Always put the reasoning/explanation before the final product recommendations.

If a user's request is unrelated to L'Oreal products, beauty, skincare, makeup, haircare, fragrance, routines, or recommendations, politely refuse to answer it. Briefly explain that you can only help with beauty-related topics and invite the user to ask about L'Oreal products, routines, or recommendations instead.

REMINDER:
- Gather user preferences and requirements first through questions if information is missing.
- Share your reasoning before stating the recommended products.
- Keep all responses clear, concise, friendly, and tailored to the individual user's needs.`;

// Keep a running conversation so follow-up questions have context.
const conversationHistory = [
  { role: "system", content: shoppingAssistantInstructions },
];

const memoryEntries = [];
let pendingArchiveEntries = null;

// Keep the initial greeting and input visible, but clear any old messages.
chatMessages.textContent = "";
if (chatEmptyState) {
  chatEmptyState.hidden = false;
}
chatWindow.classList.remove("has-messages");

function updateSendButtonState() {
  const hasText = userInput.value.trim().length > 0;
  sendBtn.disabled = !hasText;
}

function showConversationState() {
  chatWindow.classList.add("has-messages");
  if (chatEmptyState) {
    chatEmptyState.hidden = true;
  }
}

userInput.addEventListener("input", updateSendButtonState);
updateSendButtonState();

// Add one chat message to the UI.
function addChatMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.classList.add("msg");
  messageElement.classList.add(role === "user" ? "user" : "ai");

  if (role === "user") {
    messageElement.textContent = `You: ${text}`;
  } else {
    messageElement.textContent = `Assistant: ${text}`;
  }

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMemoryEntry(role, text) {
  if (!chatMemorySummary || !chatMemoryList) {
    return;
  }

  memoryEntries.push({ role, text });
  chatMemorySummary.setAttribute(
    "aria-label",
    `Chat memory (${memoryEntries.length} messages)`,
  );

  const memoryItem = document.createElement("p");
  memoryItem.classList.add("memory-item");

  const labelElement = document.createElement("strong");
  const label = role === "user" ? "You" : "Assistant";
  labelElement.textContent = `${label}: `;
  memoryItem.appendChild(labelElement);
  memoryItem.appendChild(document.createTextNode(text));

  chatMemoryList.appendChild(memoryItem);
  chatMemoryList.scrollTop = chatMemoryList.scrollHeight;
}

function archiveSearchToMemory(entries) {
  for (const entry of entries) {
    addMemoryEntry(entry.role, entry.text);
  }

  // Once a search is complete, move it to memory and clear the chat view.
  chatMessages.textContent = "";
  chatWindow.classList.remove("has-messages");
  if (chatEmptyState) {
    chatEmptyState.hidden = false;
  }
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Read the user's message and stop if it's empty
  const messageText = userInput.value.trim();
  if (!messageText) {
    return;
  }

  // Move the previous completed search to memory only when a new search starts.
  if (pendingArchiveEntries) {
    archiveSearchToMemory(pendingArchiveEntries);
    pendingArchiveEntries = null;
  }

  // Show the user's message immediately.
  showConversationState();
  addChatMessage("user", messageText);
  userInput.value = "";
  updateSendButtonState();

  const completedSearchEntries = [{ role: "user", text: messageText }];

  // Show a temporary loading message while waiting for the API.
  const loadingMessage = document.createElement("div");
  loadingMessage.classList.add("msg", "ai");
  loadingMessage.textContent = "Assistant: Thinking...";
  chatMessages.appendChild(loadingMessage);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    // Add the user message to conversation history before sending.
    conversationHistory.push({ role: "user", content: messageText });

    // Build the messages array sent to the worker.
    const messages = conversationHistory;

    // Send a POST request to your Cloudflare Worker.
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    // Parse the response and read only the assistant text
    const data = await response.json();
    const aiReply =
      data.choices?.[0]?.message?.content?.trim() || "No response text.";

    // Keep this log focused: only print the AI's text
    console.log(aiReply);

    // Remove loading text and show the real assistant reply.
    loadingMessage.remove();
    addChatMessage("assistant", aiReply);
    completedSearchEntries.push({ role: "assistant", text: aiReply });

    // Save assistant reply so future messages keep context.
    conversationHistory.push({ role: "assistant", content: aiReply });

    // Keep this completed search visible for now.
    // It moves to memory when the next search is submitted.
    pendingArchiveEntries = completedSearchEntries;
  } catch (error) {
    loadingMessage.remove();
    const errorText = "Something went wrong. Please try again in a moment.";
    addChatMessage("assistant", errorText);
    completedSearchEntries.push({ role: "assistant", text: errorText });
    pendingArchiveEntries = completedSearchEntries;
  }
});
