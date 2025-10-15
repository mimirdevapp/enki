import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const API_KEY = process.env.SPLITWISE_API_KEY;
  const { billAmount, billDescription, expenses } = req.body;
  
  try {
    // Get current user info
    const userResponse = await axios.get('https://secure.splitwise.com/api/v3.0/get_current_user', {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    
    const currentUserId = userResponse.data.user.id;
    
    // Get friends list
    const friendsResponse = await axios.get('https://secure.splitwise.com/api/v3.0/get_friends', {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    
    const friendsMap = {};
    console.log('Freind Data: ', JSON.stringify(friendsResponse.data.friends, null, 2));
    friendsResponse.data.friends.forEach(friend => {
      const firstName = friend.first_name.toLowerCase();
      const fullName = `${friend.first_name} ${friend.last_name}`.toLowerCase();
      friendsMap[firstName] = friend.id;
      friendsMap[fullName] = friend.id;
    });
    
    // Create expenses
    const results = [];
    const notFound = [];
    
    for (const expense of expenses) {
      const friendName = expense.name.toLowerCase();
      const friendId = friendsMap[friendName];
      
      if (!friendId) {
        notFound.push(expense.name);
        continue;
      }
      
      const expenseData = {
        cost: expense.amount.toFixed(2),
        description: `${billDescription} - ${expense.name}'s share`,
        date: new Date().toISOString().split('T')[0],
        users: [
          {
            user_id: currentUserId,
            paid_share: expense.amount.toFixed(2),
            owed_share: '0.00'
          },
          {
            user_id: friendId,
            paid_share: '0.00',
            owed_share: expense.amount.toFixed(2)
          }
        ]
      };
      
      const response = await axios.post(
        'https://secure.splitwise.com/api/v3.0/create_expense',
        expenseData,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      
      results.push({ name: expense.name, success: true });
    }
    
    let message = `${results.length} expense(s) added to Splitwise`;
    if (notFound.length > 0) {
      message += `\n\nNot found in Splitwise: ${notFound.join(', ')}`;
    }
    
    res.status(200).json({ 
      success: true, 
      message,
      added: results.length,
      notFound
    });
    
  } catch (error) {
    console.error('Splitwise API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data?.errors?.[0]?.message || 'Failed to add expenses to Splitwise' 
    });
  }
}