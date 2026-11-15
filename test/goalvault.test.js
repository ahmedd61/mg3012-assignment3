const GoalVault = artifacts.require("GoalVault");

// Helper: assert that a transaction reverts with a given message.
async function expectRevert(promise, message) {
  try {
    await promise;
  } catch (e) {
    assert.include(e.message, message, "Wrong revert reason: " + e.message);
    return;
  }
  assert.fail("Expected revert with: " + message);
}

contract("GoalVault", (accounts) => {
  const [alice, bob] = accounts;
  const eth = (n) => web3.utils.toWei(String(n), "ether");
  let vault;

  beforeEach(async () => {
    vault = await GoalVault.new(); // fresh contract for every test
  });

  it("sets a goal and emits GoalSet", async () => {
    const tx = await vault.setGoal(eth(1), { from: alice });
    assert.equal(tx.logs[0].event, "GoalSet");
    const v = await vault.getVault(alice);
    assert.equal(v.goal.toString(), eth(1));
    assert.equal(v.balance.toString(), "0");
    assert.equal(v.canWithdraw, false);
  });

  it("rejects a zero goal", async () => {
    await expectRevert(vault.setGoal(0, { from: alice }), "Goal must be > 0");
  });

  it("rejects a deposit before a goal is set", async () => {
    await expectRevert(vault.deposit({ from: alice, value: eth(1) }), "Set a goal first");
  });

  it("rejects a zero-value deposit", async () => {
    await vault.setGoal(eth(1), { from: alice });
    await expectRevert(vault.deposit({ from: alice, value: 0 }), "Send some ETH");
  });

  it("tracks deposits and the total locked in the contract", async () => {
    await vault.setGoal(eth(2), { from: alice });
    await vault.deposit({ from: alice, value: eth(1) });
    await vault.setGoal(eth(1), { from: bob });
    await vault.deposit({ from: bob, value: eth(0.5) });

    assert.equal((await vault.getVault(alice)).balance.toString(), eth(1));
    assert.equal((await vault.getVault(bob)).balance.toString(), eth(0.5));
    assert.equal((await vault.totalLocked()).toString(), eth(1.5));
  });

  it("blocks withdrawal before the goal is reached", async () => {
    await vault.setGoal(eth(2), { from: alice });
    await vault.deposit({ from: alice, value: eth(1) });
    assert.equal((await vault.getVault(alice)).canWithdraw, false);
    await expectRevert(vault.withdraw({ from: alice }), "Goal not reached yet");
  });

  it("blocks withdrawal when there is nothing saved", async () => {
    await expectRevert(vault.withdraw({ from: alice }), "Nothing to withdraw");
  });

  it("allows withdrawal once the goal is reached and resets the vault", async () => {
    await vault.setGoal(eth(1), { from: alice });
    await vault.deposit({ from: alice, value: eth(1) });
    assert.equal((await vault.getVault(alice)).canWithdraw, true);

    const before = web3.utils.toBN(await web3.eth.getBalance(alice));
    const tx = await vault.withdraw({ from: alice });
    assert.equal(tx.logs[0].event, "Withdrawn");
    const after = web3.utils.toBN(await web3.eth.getBalance(alice));

    // Alice's balance rises by exactly 1 ETH minus the gas she paid for the withdraw.
    const gasPrice = tx.receipt.effectiveGasPrice
      ? tx.receipt.effectiveGasPrice
      : (await web3.eth.getTransaction(tx.tx)).gasPrice;
    const gasCost = web3.utils.toBN(tx.receipt.gasUsed).mul(web3.utils.toBN(gasPrice));
    assert.equal(after.sub(before).add(gasCost).toString(), eth(1));
    const v = await vault.getVault(alice);
    assert.equal(v.balance.toString(), "0");
    assert.equal(v.goal.toString(), "0");
    assert.equal((await vault.totalLocked()).toString(), "0");
  });

  it("keeps each user's vault separate", async () => {
    await vault.setGoal(eth(1), { from: alice });
    await vault.deposit({ from: alice, value: eth(1) });
    // Bob never saved anything, so he cannot take Alice's money.
    await expectRevert(vault.withdraw({ from: bob }), "Nothing to withdraw");
  });
});
