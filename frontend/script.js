// GoalVault dApp frontend (Assignment 3: Truffle + Ganache).
// Uses ethers.js v6 with MetaMask. The contract address comes from
// contract-config.js, which `truffle migrate` writes automatically.

const CONFIG = window.APP_CONFIG || {};
const CONTRACT_ADDRESS = CONFIG.address;
const CHAIN_ID = BigInt(CONFIG.chainId || 1337);
const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
const GANACHE_NETWORK = {
  chainId: CHAIN_HEX,
  chainName: "Ganache Local",
  rpcUrls: ["http://127.0.0.1:7545"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

const ABI = [
  "function setGoal(uint256 goalWei)",
  "function deposit() payable",
  "function withdraw()",
  "function getVault(address user) view returns (uint256 balance, uint256 goal, bool canWithdraw)",
  "function totalLocked() view returns (uint256)",
  "event GoalSet(address indexed user, uint256 goal)",
  "event Deposited(address indexed user, uint256 amount, uint256 newBalance)",
  "event Withdrawn(address indexed user, uint256 amount)",
];

let provider, signer, contract, account;
const $ = (id) => document.getElementById(id);
const fmt = (w) => Number(ethers.formatEther(w)).toString();

function setStatus(m, c = "muted") { $("status").className = c; $("status").textContent = m; }
function setTx(h, c = "muted") { $("txResult").className = c; $("txResult").innerHTML = h; }
function setButtons(on) { ["refreshBtn", "goalBtn", "depBtn", "wdBtn"].forEach((i) => ($(i).disabled = !on)); }

$("contractAddr").textContent = CONTRACT_ADDRESS || "not deployed yet (run: truffle migrate)";

async function ensureGanacheNetwork() {
  if ((await provider.getNetwork()).chainId === CHAIN_ID) return;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    // Network not added to MetaMask yet: add it (this also switches to it).
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [GANACHE_NETWORK] });
  }
  provider = new ethers.BrowserProvider(window.ethereum);
}

async function connect() {
  if (!window.ethereum) { setStatus("MetaMask not found. Please install it.", "err"); return; }
  if (!CONTRACT_ADDRESS) { setStatus("No contract address yet. Run `truffle migrate` first, then reload this page.", "err"); return; }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    await ensureGanacheNetwork();

    // If Ganache was restarted, the old contract no longer exists.
    if ((await provider.getCode(CONTRACT_ADDRESS)) === "0x") {
      setStatus("No contract found at " + CONTRACT_ADDRESS + ". Run `truffle migrate --reset` and reload.", "err");
      return;
    }

    signer = await provider.getSigner();
    account = await signer.getAddress();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    setStatus("Connected: " + account + " (Ganache, chain " + CHAIN_ID + ")", "ok");
    setButtons(true);
    refresh();
  } catch (e) { setStatus("Connection failed: " + (e.shortMessage || e.message), "err"); }
}

async function refresh() {
  try {
    const [bal, goal, can] = await contract.getVault(account);
    $("balance").textContent = fmt(bal);
    $("goal").textContent = fmt(goal);
    $("canWithdraw").textContent = can ? "Yes" : "No";
    $("total").textContent = fmt(await contract.totalLocked());
    $("barFill").style.width = goal > 0n ? Math.min(100, Number((bal * 100n) / goal)) + "%" : "0%";
    loadActivity();
  } catch (e) { setTx("Read failed: " + (e.reason || e.shortMessage || e.message), "err"); }
}

// Extra feature: show this account's past events straight from the chain.
async function loadActivity() {
  try {
    const [goals, deps, wds] = await Promise.all([
      contract.queryFilter(contract.filters.GoalSet(account), 0),
      contract.queryFilter(contract.filters.Deposited(account), 0),
      contract.queryFilter(contract.filters.Withdrawn(account), 0),
    ]);
    const logs = [...goals, ...deps, ...wds].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index);
    const list = $("activity");
    list.innerHTML = "";
    if (logs.length === 0) { list.innerHTML = "<li class='muted'>No activity yet.</li>"; return; }
    for (const l of logs.slice(0, 15)) {
      const li = document.createElement("li");
      let text = "";
      if (l.eventName === "GoalSet") text = "Goal set to " + fmt(l.args.goal) + " ETH";
      if (l.eventName === "Deposited") text = "Deposited " + fmt(l.args.amount) + " ETH (balance " + fmt(l.args.newBalance) + " ETH)";
      if (l.eventName === "Withdrawn") text = "Withdrew " + fmt(l.args.amount) + " ETH";
      li.innerHTML = "<span class='tag'></span><span class='txt'></span> <span class='muted'></span>";
      li.querySelector(".tag").textContent = l.eventName;
      li.querySelector(".txt").textContent = text;
      li.querySelector(".muted").textContent = "(block " + l.blockNumber + ")";
      list.appendChild(li);
    }
  } catch (e) { $("activity").innerHTML = "<li class='err'>Could not load activity: " + (e.shortMessage || e.message) + "</li>"; }
}

// Pull the contract's revert reason (e.g. "Goal not reached yet") out of whatever
// shape the wallet/Ganache error has. Falls back to a generic hint.
function reasonOf(e) {
  const candidates = [
    e.reason, e.info?.error?.data?.message, e.info?.error?.message,
    e.error?.data?.message, e.error?.message, e.data?.message, e.shortMessage, e.message,
  ];
  for (const c of candidates) {
    const m = c && String(c).match(/revert(?:ed)?:?\s+([^\n"(]+)/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  if (e.code === "CALL_EXCEPTION" || /revert data/i.test(e.message || "")) {
    return "Rejected by the contract (is a goal set? is the goal reached? is the amount above 0?)";
  }
  return e.shortMessage || e.message;
}

async function sendTx(label, fn) {
  try {
    setTx(label + ": waiting for MetaMask confirmation...");
    const tx = await fn();
    setTx(label + ": pending... tx " + tx.hash);
    const r = await tx.wait();
    setTx(label + " confirmed in block " + r.blockNumber + ". Tx hash: " + tx.hash, "ok");
    refresh();
  } catch (e) { setTx(label + " failed: " + reasonOf(e), "err"); }
}

$("connectBtn").onclick = connect;
$("refreshBtn").onclick = refresh;
$("goalBtn").onclick = () => sendTx("Set goal", () => contract.setGoal(ethers.parseEther($("goalInput").value || "0")));
$("depBtn").onclick = () => sendTx("Deposit", () => contract.deposit({ value: ethers.parseEther($("depInput").value || "0") }));
$("wdBtn").onclick = () => sendTx("Withdraw", () => contract.withdraw());
if (window.ethereum) {
  window.ethereum.on("chainChanged", () => location.reload());
  window.ethereum.on("accountsChanged", () => location.reload());
}
