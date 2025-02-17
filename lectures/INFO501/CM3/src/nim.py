print("Py Nim\n")
 
def getTokens(tokens, name):
  print("{}, how many tokens would you like to take? ".format(name))
  take = int(input())

  if (take < 1 or take > 3):
    print("Number must be between 1 and 3.\n")
    return getTokens(tokens, name)
    
  tokens = tokens - take
  print('You take {} tokens.'.format(take))
  print('{} tokens remaining.\n'.format(tokens))
  return tokens
 
 
name1 = input("Insert the name of player one: ")
name2 = input("Insert the name of player two: ")

tokens = 12

turn = 0
while (tokens > 0):
  if turn == 0:
  	tokens = getTokens(tokens, name1)
  else: 
    tokens = getTokens(tokens, name2)
  turn = (turn + 1) % 2

if turn == 1:
  print("{} wins!".format(name1))
else:
  print("{} wins!".format(name2))