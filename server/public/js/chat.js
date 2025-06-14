const form = document.getElementById("chat-form");
const input = document.getElementById("msg");
const log = document.getElementById("log");

function addLine(text, cls) {
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = text;
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addLine(text, "you");
  input.value = "";

  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const { text: reply } = await r.json();
  addLine(reply, "bot");
});
