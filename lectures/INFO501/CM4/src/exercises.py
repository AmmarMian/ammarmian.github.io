def somme(n):
  result = 0
  for i in range(1, n+1):
    result = result + i
  return result


def suite(n):
  result = float(1/3)
  for i in range(1, n+1):
    result = 4 * result - 1
  return result

def factorielle(n):
  result = 1
  for i in range(1, n+1):
    result = result * i
  return result

def fibonacci(n):
  if 0 <= n < 2:
    return n
  else:
    a = 0
    b = 1
    for i in range(2, n + 1):
      c = b + a
      a = b
      b = c
  return c

def persistanceMultiplicative(n):
  compteur = 0
  
  while n > 10:
      x = 1
      while n > 0:
          x = x * (n % 10)
          n = n // 10
      n = x
      compteur = compteur + 1        
  return compteur
  
def palindrome(s):
  i = 0
  indiceDernierCaractere = len(s) - 1
  while i <= indiceDernierCaractere//2 and s[i] == s[indiceDernierCaractere - i]:
    i = i + 1 
      
  return i > indiceDernierCaractere//2
  
def palindrome_pythonic(s):
  return s == s[::-1]

def decimalToBase(x,b):
  result = ''
  while x >= b:
    modulo = x % b
    result = str(modulo) + result
    x = x // b # Pour forcer la division entière
  else:
    result = str(x) + result
  return result

def posToChar(x):
  return chr(x + 65)

def charToPos(c):
  return ord(c) - 65

def crypt(c, key):
  return posToChar((charToPos(c) + key) % 26)