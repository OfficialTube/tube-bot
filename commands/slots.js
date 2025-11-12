const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
  } = require("discord.js");
  const User = require("../models/User");
  
  const numberEmojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"];
  const odds = [0.25,0.20,0.15,0.12,0.10,0.07,0.05,0.04,0.02];
  const allowedBets = [1,5,10,50,100,500,1000];
  const HOUSE_EDGE = 0.97;
  
  // scale factor to give slight house edge (~3%)
  const G_current = 13.799537; // precomputed expected gross payout
  const s = (1 - 0.03) / G_current;
  
  const displayedMultipliers = {
    double: [0.3,0.4,0.7,1,1.3,2.7,5,8,30],
    triple: [4,9,21,41,70,205,562,1098,8787],
  };
  
  const moneyFormat = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  
  // Choose a symbol based on odds
  function spinSymbol(){
    const rand = Math.random();
    let sum = 0;
    for(let i=0;i<odds.length;i++){
      sum += odds[i];
      if(rand<sum) return i+1;
    }
    return 9;
  }
  
  // Actual payout multiplier calculation
  function getRealMultiplier(num,count){
    const base = (1/odds[num-1]) * s * HOUSE_EDGE;
    return count===2 ? base/2 : base;
  }
  
  // Animate reels individually
  async function animateSlots(button, finalSlots, totalDuration = 5000, interval = 200) {
    return new Promise((resolve) => {
      const start = Date.now();
      const reelDone = [false,false,false];
      let displaySlots = ["❔","❔","❔"];
  
      async function spin() {
        const elapsed = Date.now() - start;
        if(elapsed >= totalDuration){
          displaySlots = finalSlots.map(n => numberEmojis[n-1]);
          const embed = new EmbedBuilder()
            .setTitle("🎰 Slot Machine")
            .setColor(0x3498db)
            .setDescription(displaySlots.join(" "));
          try { await button.editReply({ embeds:[embed] }); } catch(err){}
          return resolve();
        }
  
        for(let i=0;i<3;i++){
          if(!reelDone[i] && elapsed >= ((i+1) * totalDuration/3)){
            reelDone[i] = true;
            displaySlots[i] = numberEmojis[finalSlots[i]-1];
          } else if(!reelDone[i]){
            displaySlots[i] = numberEmojis[Math.floor(Math.random()*9)];
          }
        }
  
        const embed = new EmbedBuilder()
          .setTitle("🎰 Slot Machine")
          .setColor(0x3498db)
          .setDescription(displaySlots.join(" "));
  
        try { await button.editReply({ embeds:[embed] }); } catch(err){}
        setTimeout(spin, interval);
      }
  
      spin();
    });
  }
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName("slots")
      .setDescription("Spin the slot machine with buttons to select your bet!"),
  
    async execute(interaction){
      let user = await User.findOne({userId:interaction.user.id});
      if(!user) return interaction.reply({content:"❌ You don’t have an account yet!", ephemeral:true});
  
      // Build button rows
      const rows=[];
      for(let i=0;i<allowedBets.length;i+=5){
        const slice = allowedBets.slice(i,i+5);
        const row = new ActionRowBuilder().addComponents(
          slice.map(bet => new ButtonBuilder()
            .setCustomId(`slot_${bet}`)
            .setLabel(`$${bet}`)
            .setStyle(ButtonStyle.Primary)
          )
        );
        rows.push(row);
      }
  
      const embed = new EmbedBuilder()
        .setTitle("🎰 Slot Machine")
        .setDescription(`Pick a bet amount to spin!\n\n💰 **Your Balance:** ${moneyFormat.format(user.money.toFixed(2))}`)
        .setColor(0x3498db);
  
      const message = await interaction.reply({
        embeds:[embed],
        components: rows,
        ephemeral:true,
        fetchReply:true
      });
  
      const collector = message.createMessageComponentCollector({
        componentType:ComponentType.Button,
        time:30000
      });
  
      collector.on("collect", async(button)=>{
        if(button.user.id!==interaction.user.id)
          return button.reply({content:"❌ This isn’t your slot machine!", ephemeral:true});
  
        const bet = parseInt(button.customId.split("_")[1]);
        if(user.money<bet) return button.reply({content:"❌ You don’t have enough money.", ephemeral:true});
  
        // Disable buttons during spin
        const disabledRows = rows.map(row => new ActionRowBuilder().addComponents(
          row.components.map(btn => new ButtonBuilder()
            .setCustomId(btn.data.custom_id)
            .setLabel(btn.data.label)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
          )
        ));
        await button.update({components:disabledRows});
  
        // Generate final spin
        const finalSlots = [spinSymbol(), spinSymbol(), spinSymbol()];
  
        // Animate reels
        await animateSlots(button, finalSlots, 5000, 200);
  
        // Calculate result
        const counts={};
        for(const num of finalSlots) counts[num]=(counts[num]||0)+1;
        const matchNum = Object.keys(counts).find(k=>counts[k]>1);
  
        let payout = 0;
        let resultText = "You lost!";
        if(matchNum){
          const num = parseInt(matchNum);
          const count = counts[num];
  
          const shownMultiplier = count===2 ? displayedMultipliers.double[num-1] : displayedMultipliers.triple[num-1];
          const realMultiplier = getRealMultiplier(num,count);
          payout = +(bet * realMultiplier).toFixed(2);
  
          // Deduct bet immediately
          user.money = +(user.money - bet).toFixed(2);
          user.roundsSlots++;
          user.moneyBetSlots += bet;
          user.moneySpentSlots += bet;
  
          // Update stats
          user.money += payout;
          user.moneyEarnedSlots += payout;
          const fieldName = `${count===2?"double":"triple"}${num}`;
          user[fieldName] = (user[fieldName]||0)+1;
          user.moneyNetSlots = +(user.moneyEarnedSlots - user.moneySpentSlots).toFixed(2);
          if(payout>user.maxWon) user.maxWon = payout;
  
          resultText = count===3
            ? `🎉 **TRIPLE ${num}!** You won **${shownMultiplier}x**!\n💵 ${moneyFormat.format(bet)} × ${shownMultiplier} = ${moneyFormat.format(payout)}`
            : `⭐ **DOUBLE ${num}!** You won **${shownMultiplier}x**!\n💵 ${moneyFormat.format(bet)} × ${shownMultiplier} = ${moneyFormat.format(payout)}`;
        } else {
          user.moneyNetSlots = +(user.moneyEarnedSlots - user.moneySpentSlots).toFixed(2);
        }
  
        await user.save();
  
        // Show final result
        const resultEmbed = new EmbedBuilder()
          .setColor(payout>0 ? 0x2ecc71 : 0xe74c3c)
          .setTitle("🎰 Slot Machine")
          .setDescription(finalSlots.map(n=>numberEmojis[n-1]).join(" "))
          .addFields(
            {name:"Bet",value:moneyFormat.format(bet),inline:true},
            {name:"Result",value:resultText,inline:false},
            {name:"New Balance",value:moneyFormat.format(user.money.toFixed(2)),inline:true}
          );
  
        await button.editReply({embeds:[resultEmbed], components:[]});
      });
    }
  };
  