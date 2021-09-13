'''
File: nim_fr.py
Created Date: Monday September 13th 2021 - 01:57pm
Author: Ammar Mian
Contact: ammar.mian@univ-smb.fr
-----
Last Modified: Mon Sep 13 2021
Modified By: Ammar Mian
-----
Copyright (c) 2021 Université Savoie Mont-Blanc
-----
Ce programme illustre une implémentation du jeu de Nim dans le cadre 
d'un cours d'introduction à la programmation donné à Polytech Annecy-Chambéry.
Il s'agit ici d'un programme fonctionnel qui permet de faire une partie à 2 joueurs
'''


def choix_joueur(nombre_batonnets):
    """Fonction qui permet de prendre le choix du joueur et vérifie s'il est bon.
    Répète tant que le choix est mauvais.

    Parameters
    ----------
    nombre_batonnets : int
        Nombre de batonnets restant dans le jeu.

    Returns
    -------
    int
        Le nombre de batonnets que le joueur veur jouer.
    """
    nombre_pris = int(input("Entrez un nombre de bâtonnets : "))

    # Il faudrait une répétition mais ça on verra après !
    while (nombre_pris <=0 or nombre_pris>min(3, nombre_batonnets)):
        print("Le nombre de bâtonnets à prendre n'est pas correct !")
        print('Choisir une valeur entre 1 et ', min(3, nombre_batonnets), '.')
        nombre_pris = int(input("Entrez un nombre de bâtonnets : "))

    return nombre_pris


def tour_jeu(no_joueur, nombre_batonnets):
    """Fonction qui permet de faire un tour de jeu en fonction du numéro du joueur actuel.

    Parameters
    ----------
    no_joueur : int
        Numéro du joueur.
    nombre_batonnets : int
        Nombre de batonnets restant dans le jeu.

    Returns
    -------
    int
        Nombre de batonnets restant après tour du joueur.
    """
    print("Joueur no.", no_joueur)
    nombre_pris = choix_joueur(nombre_batonnets)

    nombre_batonnets -= nombre_pris
    if nombre_batonnets == 0:
        print("Félicitations Joueur no. {}!! Vous avez gagné !".format(no_joueur))
        return 0
    else:
        print("Il reste ", nombre_batonnets, "batonnets.")
        print('|'*nombre_batonnets)
        print("")
        return nombre_batonnets


if __name__ =='__main__':
    print("Bienvenue dans le jeu de Nim avec batonnets !\n")

    nombre_batonnets = 12
    no_joueur = 1
    print("Il reste ", nombre_batonnets, "batonnets.")
    print('|'*nombre_batonnets)
    print("")
    while nombre_batonnets>0:
        nombre_batonnets = tour_jeu(no_joueur, nombre_batonnets)
        no_joueur = 1*(no_joueur==2) + 2*(no_joueur==1) 
    print("Merci d'avoir joué !")
