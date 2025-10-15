import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const API_KEY = process.env.SPLITWISE_API_KEY;
  const GROUP_ID = 51896232;
  const { billAmount, billDescription, expenses } = req.body;
  
  console.log('Adding expenses:', expenses);
  
  try {
    // Get current user info
    const userResponse = await axios.get('https://secure.splitwise.com/api/v3.0/get_current_user', {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    
    const currentUserId = userResponse.data.user.id;
    console.log('Current user ID:', currentUserId);
    
    // Get group members
    const groupResponse = await axios.get(`https://secure.splitwise.com/api/v3.0/get_group/${GROUP_ID}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    
    const groupMembers = groupResponse.data.group.members;
    console.log('Group members:', groupMembers.map(m => ({ 
      id: m.id, 
      name: `${m.first_name} ${m.last_name}` 
    })));
    
    // Create a map of member names to IDs
    const membersMap = {};
    groupMembers.forEach(member => {
      const firstName = member.first_name.toLowerCase().trim();
      const fullName = `${member.first_name} ${member.last_name}`.toLowerCase().trim();
      membersMap[firstName] = member.id;
      membersMap[fullName] = member.id;
    });
    
    // Create a single expense with all splits
    const notFound = [];
    const users = [];
    
    // Add current user as the payer
    users.push({
      user_id: currentUserId,
      paid_share: billAmount.toFixed(2),
      owed_share: '0.00'
    });
    
    // Add each person's owed share
    for (const expense of expenses) {
      const memberName = expense.name.toLowerCase().trim();
      const memberId = membersMap[memberName];
      
      console.log(`Looking for member: "${memberName}" -> ID: ${memberId}`);
      
      if (!memberId) {
        notFound.push(expense.name);
        console.log(`Member not found: ${expense.name}`);
        continue;
      }
      
      // Skip if this is the current user (already added as payer)
      if (memberId === currentUserId) {
        users[0].owed_share = expense.amount.toFixed(2);
        continue;
      }
      
      users.push({
        user_id: memberId,
        paid_share: '0.00',
        owed_share: expense.amount.toFixed(2)
      });
    }
    
    // Build the expense data using form-encoded format
    const formData = {
      cost: billAmount.toFixed(2),
      description: billDescription,
      date: new Date().toISOString().split('T')[0],
      group_id: GROUP_ID,
      currency_code: 'INR'
    };
    
    // Add users data in the required format
    users.forEach((user, index) => {
      formData[`users__${index}__user_id`] = user.user_id;
      formData[`users__${index}__paid_share`] = user.paid_share;
      formData[`users__${index}__owed_share`] = user.owed_share;
    });
    
    console.log('Sending expense data:', formData);
    
    const response = await axios.post(
      'https://secure.splitwise.com/api/v3.0/create_expense',
      formData,
      { 
        headers: { 
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('Expense created:', response.data.expenses[0]);
    
    let message = `Expense added to Splitwise group`;
    if (notFound.length > 0) {
      message += `\n\nNot found in group: ${notFound.join(', ')}`;
    }
    
    res.status(200).json({ 
      success: true, 
      message,
      notFound,
      expenseDetails: response.data.expenses[0]
    });
    
  } catch (error) {
    console.error('Splitwise API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.errors?.[0]?.message || error.message,
      fullError: error.response?.data
    });
  }
}